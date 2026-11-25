package ru.mirea.orbita;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import javax.net.ssl.HttpsURLConnection;

/** Pulse gRPC-Web messages for the signed-in student's grades and personal attendance. */
final class MireaAcademicApi {
    static final String ORIGIN = "https://pulse.mirea.ru";
    private static final String UUID = "[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}";
    private static final String ATTENDANCE = "fc76ecc6-3ac7-5a50-9694-72e0bf301976";

    static final class SignInRequired extends IOException {}
    record Category(String name, double points, Double maximum) {}
    record Course(String id, String name, int term, Double total, Double maximum, Double attendance,
                  List<Category> categories, Double threshold, String thresholdName, int present, int lessons) {}
    record DailyMark(String subject, long start, int type) {}
    private static final Map<String, String> CATEGORY_NAMES = categoryNames();

    private static Map<String, String> categoryNames() {
        var names = new HashMap<String, String>();
        names.put(ATTENDANCE, "Посещения");
        names.put("e8e1272c-63b2-5a17-b60d-4b7aac78169e", "Текущий контроль");
        names.put("b05e81e2-8c9b-5050-97d5-0d0c7c232468", "Семестровый контроль");
        names.put("5bd0a6c7-53e5-5c7d-aa6b-0dd8356a366c", "Достижения");
        names.put("d88ec1f5-9400-5bae-9b58-b4c2f64a9f1f", "Дополнительные");
        return names;
    }
    record Field(int number, Object value) {}

    private final String cookie;

    MireaAcademicApi(String cookie) {
        this.cookie = cookie;
    }

    void verifySession() throws IOException {
        request("rtu_tc.attendance.api.VisitingLogService/GetAvailableVisitingLogsOfStudent", new byte[0]);
    }

    static int serviceStatus(String url) {
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection) new URL(url).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("HEAD");
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            return connection.getResponseCode();
        } catch (IOException error) {
            return 0;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    List<Course> grades() throws IOException {
        byte[] journals = request("rtu_tc.attendance.api.VisitingLogService/GetAvailableVisitingLogsOfStudent", new byte[0]);
        String student = studentId(fields(journals));
        if (student.isEmpty()) {
            for (var wrapped : messages(fields(journals), 1)) {
                student = studentId(wrapped);
                if (!student.isEmpty()) break;
            }
        }
        if (student.isEmpty()) throw new IOException("В МИРЭА не найдена запись студента");
        var plans = fields(request("rtu_tc.student.api.StudentService/GetStudentTermPlansWithDisciplines", strings(1, java.util.Collections.singletonList(student))));
        var ids = new LinkedHashSet<String>();
        var terms = new HashMap<String, Integer>();
        var termByWorkPlan = new HashMap<String, Integer>();
        var sports = new ArrayList<Course>();
        for (var plan : messages(plans, 1)) {
            Double term = number(plan, 1);
            if (term == null) continue;
            for (int group : new int[]{2, 3}) {
                for (var entry : messages(plan, group)) {
                    var discipline = message(entry, 1);
                    String id = string(discipline, 1);
                    if (!id.matches(UUID)) continue;
                    ids.add(id);
                    String name = string(discipline, 2);
                    if (isPhysicalEducation(name) && term.intValue() > 0
                        && (group == 3 || !messages(entry, 2).isEmpty())) {
                        sports.add(new Course(id, name, term.intValue(), null, null, null, java.util.Collections.emptyList(), null, "", 0, 0));
                    }
                    terms.merge(id, term.intValue(), Math::max);
                    if (group == 2) {
                        for (var element : messages(entry, 2)) {
                            termByWorkPlan.put(string(element, 1), term.intValue());
                        }
                    }
                }
            }
        }
        if (ids.isEmpty()) return java.util.Collections.emptyList();
        var query = new ByteArrayOutputStream();
        query.write(strings(1, ids));
        query.write(strings(2, java.util.Collections.singletonList(student)));
        var reports = fields(request("rtu_tc.attendance.api.LearnRatingScoreService/GetAttendancesAndLRSByDisciplinesIds", query.toByteArray()));
        var result = courses(reports, terms, termByWorkPlan);
        int currentTerm = result.stream().mapToInt(Course::term).max().orElse(0);
        for (Course sport : sports) {
            if (currentTerm > 0 && sport.term() > currentTerm) continue;
            if (result.stream().noneMatch(course -> course.id().equals(sport.id()) && course.term() == sport.term())) {
                result.add(sport);
            }
        }
        return result;
    }

    private static boolean isPhysicalEducation(String name) {
        String lower = name.toLowerCase(java.util.Locale.ROOT);
        return lower.contains("физическая культура") || lower.contains("физической культуре") || lower.contains("физкультура");
    }

    static List<Course> courses(List<Field> reports, Map<String, Integer> terms, Map<String, Integer> termByWorkPlan) throws IOException {
        var courses = new ArrayList<Course>();
        var periodTerms = new HashMap<String, Integer>();
        for (var report : messages(reports, 1)) {
            for (var part : messages(report, 3)) {
                for (var rating : messages(part, 4)) {
                    Integer term = termByWorkPlan.get(string(rating, 1));
                    String period = periodKey(part);
                    if (term != null && !period.isEmpty()) periodTerms.put(period, term);
                }
            }
        }
        for (var report : messages(reports, 1)) {
            String name = string(report, 2);
            if (name.isEmpty()) continue;
            for (var part : messages(report, 3)) {
                int present = 0, lessons = 0;
                for (int type : new int[]{2, 3}) {
                    for (var attendanceBlock : messages(part, type)) {
                        var stats = message(attendanceBlock, 2);
                        Double count = number(stats, 4), attended = number(stats, 2);
                        if (count != null && count > 0) {
                            lessons += count.intValue();
                            if (attended != null) present += attended.intValue();
                        }
                    }
                }
                var ratings = messages(part, 4);
                int partTerm = periodTerms.getOrDefault(periodKey(part), terms.getOrDefault(string(report, 1), 0));
                if (ratings.isEmpty() && isPhysicalEducation(name)) {
                    courses.add(new Course(string(report, 1), name, partTerm, null, null, null,
                        java.util.Collections.emptyList(), null, "", present, lessons));
                }
                for (var rating : ratings) {
                    var info = message(rating, 4);
                    if (info.isEmpty() && !isPhysicalEducation(name)) continue;
                    Double total = number(info, 2);
                    Double attendance = null;
                    var maxima = new HashMap<String, Double>();
                    for (var group : messages(rating, 2)) {
                        for (var type : messages(group, 2)) {
                            Double maximum = number(type, 4);
                            if (maximum != null) maxima.put(string(type, 1), maximum);
                        }
                    }
                    var earned = new HashMap<String, Double>();
                    double sum = 0;
                    boolean hasPoints = false;
                    for (var component : messages(info, 1)) {
                        Double points = number(component, 2);
                        if (points == null) continue;
                        hasPoints = true;
                        sum += points;
                        String category = string(component, 1);
                        earned.put(category, points);
                        if (ATTENDANCE.equals(category)) attendance = points;
                    }
                    if (total == null && hasPoints) total = sum;
                    int term = termByWorkPlan.getOrDefault(string(rating, 1), partTerm);
                    var categories = new ArrayList<Category>();
                    for (var category : CATEGORY_NAMES.entrySet()) {
                        String id = category.getKey();
                        if (earned.containsKey(id) || maxima.containsKey(id)) {
                            categories.add(new Category(category.getValue(), earned.getOrDefault(id, 0.0), maxima.get(id)));
                        }
                    }
                    Double threshold = null;
                    String thresholdName = "";
                    for (var border : messages(rating, 3)) {
                        Double required = number(border, 2);
                        String nameOfGrade = string(border, 3);
                        String label = nameOfGrade.toLowerCase(java.util.Locale.ROOT);
                        if (required != null && required > 0
                            && (label.equals("удовлетворительно") || label.equals("зачтено") || label.equals("зачёт") || label.equals("зачет"))) {
                            threshold = required;
                            thresholdName = label.equals("удовлетворительно") ? "тройки" : "зачёта";
                            break;
                        }
                    }
                    courses.add(new Course(string(report, 1), name, term, total, number(rating, 5),
                        attendance, categories, threshold, thresholdName, present, lessons));
                }
            }
        }
        return courses;
    }

    private static String periodKey(List<Field> part) throws IOException {
        var period = message(part, 1);
        String year = string(period, 1), term = string(period, 2);
        return year.isEmpty() || term.isEmpty() ? "" : year + ":" + term;
    }

    List<DailyMark> dailyMarks(java.time.LocalDate date) throws IOException {
        byte[] day = {8, (byte) ((date.getYear() & 127) | 128), (byte) (date.getYear() >>> 7),
            16, (byte) date.getMonthValue(), 24, (byte) date.getDayOfMonth()};
        byte[] payload = new byte[day.length + 2];
        payload[0] = 18;
        payload[1] = (byte) day.length;
        System.arraycopy(day, 0, payload, 2, day.length);
        return parseDailyMarks(fields(request("rtu_tc.attendance.api.LessonService/GetAvailableLessonsOfVisitingLogs", payload)));
    }

    static List<DailyMark> parseDailyMarks(List<Field> data) throws IOException {
        var marks = new ArrayList<DailyMark>();
        for (var entry : messages(data, 2)) {
            var lesson = message(entry, 3);
            var status = message(entry, 4);
            if (status.isEmpty()) continue;
            int type = switch (status.get(0).number()) {
                case 1 -> 1;
                case 2 -> 3;
                case 3 -> 2;
                default -> 0;
            };
            String subject = string(message(lesson, 4), 2);
            Double start = number(message(lesson, 2), 1);
            if (type != 0 && !subject.isEmpty() && start != null && start > 0) {
                marks.add(new DailyMark(subject, start.longValue(), type));
            }
        }
        return marks;
    }

    record AttendanceEntry(long start, int type) {}
    record Attendance(int present, int absent, int excused, int total, List<AttendanceEntry> entries) {}

    Attendance attendance(String discipline) throws IOException {
        if (discipline == null || !discipline.matches(UUID)) throw new IOException("Неизвестная дисциплина");
        var journals = fields(request("rtu_tc.attendance.api.VisitingLogService/GetAvailableVisitingLogsOfStudent", new byte[0]));
        String student = studentId(journals);
        if (student.isEmpty()) {
            for (var wrapped : messages(journals, 1)) {
                student = studentId(wrapped);
                if (!student.isEmpty()) {
                    journals = wrapped;
                    break;
                }
            }
        }
        if (student.isEmpty()) throw new IOException("Не найден журнал студента");
        var available = new LinkedHashSet<String>();
        for (var entry : messages(journals, 1)) {
            String owner = string(entry, 4);
            String journal = string(message(entry, 1), 1);
            if ((owner.isEmpty() || owner.equals(student)) && journal.matches(UUID)) available.add(journal);
        }
        for (var entry : messages(journals, 2)) {
            String owner = string(message(entry, 1), 2);
            String journal = string(message(entry, 2), 1);
            if (owner.equals(student) && journal.matches(UUID)) available.add(journal);
        }
        if (available.isEmpty()) throw new IOException("Не найден журнал студента");
        List<AttendanceEntry> entries = java.util.Collections.emptyList();
        IOException lastError = null;
        boolean answered = false;
        for (String journal : available) {
            var query = new ByteArrayOutputStream();
            query.write(strings(1, java.util.Collections.singletonList(student)));
            query.write(strings(2, java.util.Collections.singletonList(discipline)));
            query.write(strings(3, java.util.Collections.singletonList(journal)));
            try {
                byte[] payload = request("rtu_tc.attendance.api.AttendanceService/GetStudentAttendancesOfDisciplineInVisitingLog", query.toByteArray());
                var data = fields(payload);
                entries = attendanceEntries(data);
                if (entries.isEmpty()) {
                    for (var wrapped : messages(data, 1)) {
                        try {
                            entries = attendanceEntries(wrapped);
                        } catch (IOException ignored) {
                            continue;
                        }
                        if (!entries.isEmpty()) break;
                    }
                }
                answered = true;
                if (!entries.isEmpty()) break;
            } catch (SignInRequired error) {
                throw error;
            } catch (IOException error) {
                lastError = error;
            }
        }
        if (!answered && lastError != null) throw lastError;
        int present = 0, absent = 0, excused = 0;
        for (var entry : entries) {
            if (entry.type() == 3) present++;
            else if (entry.type() == 2) excused++;
            else if (entry.type() == 1) absent++;
        }
        return new Attendance(present, absent, excused, entries.size(), entries);
    }

    static List<AttendanceEntry> attendanceEntries(List<Field> response) throws IOException {
        var entries = new ArrayList<AttendanceEntry>();
        long now = java.time.Instant.now().getEpochSecond();
        for (var entry : messages(response, 1)) {
            var lesson = message(entry, 2);
            Double seconds = number(message(lesson, 2), 1);
            if (seconds == null || seconds < 1_500_000_000 || seconds > now) continue;
            Double type = number(message(entry, 1), 2);
            entries.add(new AttendanceEntry(seconds.longValue(), type == null ? 0 : type.intValue()));
        }
        entries.sort(java.util.Comparator.comparingLong(AttendanceEntry::start).reversed());
        return entries;
    }

    boolean markAttendance(String token) throws IOException {
        byte[] response = request("rtu_tc.attendance.api.AttendanceService/SelfApproveAttendanceThroughQRCode", strings(1, java.util.Collections.singletonList(token)));
        var result = fields(response);
        Double direct = number(result, 1);
        if (direct != null) return direct == 1;
        var wrapped = message(result, 1);
        Double value = number(wrapped, 1);
        if (value != null) return value == 1;
        if (!string(message(result, 2), 1).isEmpty()) return true;
        if (!wrapped.isEmpty()) return false;
        throw new IOException("МИРЭА не подтвердила отметку");
    }

    private static String studentId(List<Field> response) throws IOException {
        for (var entry : messages(response, 1)) {
            String id = string(entry, 4);
            if (id.matches(UUID)) return id;
        }
        for (var entry : messages(response, 2)) {
            String id = string(message(entry, 1), 2);
            if (id.matches(UUID)) return id;
        }
        return "";
    }

    private byte[] request(String method, byte[] payload) throws IOException {
        var connection = (HttpsURLConnection) new URL(ORIGIN + "/" + method).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(15000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/grpc-web+proto");
            connection.setRequestProperty("Accept", "application/grpc-web+proto");
            connection.setRequestProperty("x-grpc-web", "1");
            connection.setRequestProperty("x-requested-with", "XMLHttpRequest");
            connection.setRequestProperty("Origin", ORIGIN);
            connection.setRequestProperty("Referer", ORIGIN + "/");
            connection.setRequestProperty("pulse-app-type", "pulse-app");
            connection.setRequestProperty("pulse-app-version", "1.5.9+5157");
            connection.setRequestProperty("Cookie", cookie);
            connection.setFixedLengthStreamingMode(payload.length + 5);
            try (var out = new DataOutputStream(connection.getOutputStream())) {
                out.writeByte(0);
                out.writeInt(payload.length);
                out.write(payload);
            }
            int status = connection.getResponseCode();
            if (status == 401 || (status >= 300 && status < 400)) throw new SignInRequired();
            if (status != 200) throw new IOException("МИРЭА вернула ошибку " + status);
            String headerStatus = connection.getHeaderField("grpc-status");
            try (var in = new DataInputStream(connection.getInputStream())) {
                byte[] result = null;
                int flags;
                while ((flags = in.read()) != -1) {
                    int length = in.readInt();
                    if (length < 0 || length > 8 * 1024 * 1024) throw new IOException("Некорректный ответ МИРЭА");
                    byte[] bytes = new byte[length];
                    in.readFully(bytes);
                    if (flags == 0) result = bytes;
                    else if (flags == 128) {
                        for (String line : new String(bytes, StandardCharsets.US_ASCII).split("\\r?\\n")) {
                            if (line.regionMatches(true, 0, "grpc-status:", 0, 12)) headerStatus = line.substring(12).trim();
                        }
                    } else throw new IOException("Неизвестный формат ответа МИРЭА");
                }
                if ("16".equals(headerStatus) || "7".equals(headerStatus)) throw new SignInRequired();
                if (result == null || (headerStatus != null && !"0".equals(headerStatus)))
                    throw new IOException("МИРЭА не обработала запрос");
                return result;
            }
        } finally {
            connection.disconnect();
        }
    }

    static List<Field> fields(byte[] bytes) throws IOException {
        var buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        var result = new ArrayList<Field>();
        while (buffer.hasRemaining()) {
            long key = varint(buffer);
            int number = (int) (key >>> 3);
            if (number == 0) throw new IOException("Неверный формат данных МИРЭА");
            switch ((int) key & 7) {
                case 0 -> result.add(new Field(number, varint(buffer)));
                case 1 -> {
                    if (buffer.remaining() < 8) throw new IOException("Неполный ответ МИРЭА");
                    result.add(new Field(number, buffer.getDouble()));
                }
                case 2 -> {
                    long length = varint(buffer);
                    if (length < 0 || length > buffer.remaining()) throw new IOException("Неполный ответ МИРЭА");
                    byte[] value = new byte[(int) length];
                    buffer.get(value);
                    result.add(new Field(number, value));
                }
                case 5 -> {
                    if (buffer.remaining() < 4) throw new IOException("Неполный ответ МИРЭА");
                    result.add(new Field(number, buffer.getFloat()));
                }
                default -> throw new IOException("Неверный формат данных МИРЭА");
            }
        }
        return result;
    }

    private static long varint(ByteBuffer buffer) throws IOException {
        long value = 0;
        for (int shift = 0; buffer.hasRemaining() && shift < 64; shift += 7) {
            int next = buffer.get() & 255;
            value |= (long) (next & 127) << shift;
            if (next < 128) return value;
        }
        throw new IOException("Неполный ответ МИРЭА");
    }

    private static void writeVarint(ByteArrayOutputStream out, int value) {
        while (value >= 128) {
            out.write((value & 127) | 128);
            value >>>= 7;
        }
        out.write(value);
    }

    private static byte[] strings(int field, Iterable<String> values) {
        var out = new ByteArrayOutputStream();
        for (String value : values) {
            byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
            writeVarint(out, field << 3 | 2);
            writeVarint(out, bytes.length);
            out.write(bytes, 0, bytes.length);
        }
        return out.toByteArray();
    }

    private static List<List<Field>> messages(List<Field> fields, int number) throws IOException {
        var result = new ArrayList<List<Field>>();
        for (Field field : fields) if (field.number() == number && field.value() instanceof byte[] bytes) result.add(fields(bytes));
        return result;
    }

    private static List<Field> message(List<Field> fields, int number) throws IOException {
        for (Field field : fields) if (field.number() == number && field.value() instanceof byte[] bytes) return fields(bytes);
        return java.util.Collections.emptyList();
    }

    private static String string(List<Field> fields, int number) {
        for (Field field : fields) if (field.number() == number && field.value() instanceof byte[] bytes)
            return new String(bytes, StandardCharsets.UTF_8).trim();
        return "";
    }

    private static Double number(List<Field> fields, int number) {
        for (Field field : fields) if (field.number() == number && field.value() instanceof Number value)
            return Double.isFinite(value.doubleValue()) ? value.doubleValue() : null;
        return null;
    }
}
