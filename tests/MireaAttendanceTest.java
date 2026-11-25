package ru.mirea.orbita;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Instant;
import java.util.List;

public class MireaAttendanceTest {
    private static final byte[] EMPTY = {};
    private static final long START = Instant.parse("2025-11-25T08:00:00Z").getEpochSecond();

    public static void main(String[] args) throws IOException {
        byte[] present = message(1, concat(message(1, number(2, 3)), message(2, message(2, number(1, START)))));
        byte[] absent = message(1, concat(message(1, number(2, 1)), message(2, message(2, number(1, START)))));
        byte[] wrapped = message(1, absent);
        var all = MireaAcademicApi.collectAttendance(List.of("empty", "plain", "wrapped"), journal -> switch (journal) {
            case "plain" -> present;
            case "wrapped" -> wrapped;
            default -> EMPTY;
        });
        check(all.total() == 2 && all.present() == 1 && all.absent() == 1 && all.journals() == 3);
        check(MireaAcademicApi.collectAttendance(List.of("empty"), id -> EMPTY).total() == 0);
        var partial = MireaAcademicApi.collectAttendance(List.of("ok", "broken"), id -> id.equals("ok") ? present : number(8, 4));
        check(partial.partial() && partial.total() == 1);
        var mixed = MireaAcademicApi.collectAttendance(List.of("mixed"), id -> concat(message(1, number(8, 4)), present));
        check(mixed.partial() && mixed.present() == 1);
        var networkPartial = MireaAcademicApi.collectAttendance(List.of("ok", "offline"), id -> {
            if (id.equals("offline")) throw new IOException();
            return present;
        });
        check(networkPartial.partial() && networkPartial.present() == 1);
        expectFailure("format", () -> MireaAcademicApi.collectAttendance(List.of("a", "b"), id -> id.equals("a") ? EMPTY : number(8, 4)));
        expectFailure("network", () -> MireaAcademicApi.collectAttendance(List.of("a"), id -> { throw new IOException(); }));
        check(MireaAcademicApi.collectAttendance(List.of("a"), id -> wrapped).absent() == 1);
        byte[] unmarked = message(1, message(2, message(2, number(1, START))));
        check(MireaAcademicApi.collectAttendance(List.of("a"), id -> unmarked).total() == 0);
        byte[] stats = message(2, concat(number(1, 18), number(2, 9), number(3, 2), number(4, 5)));
        var summary = MireaAcademicApi.attendanceSummary(MireaAcademicApi.fields(message(1, stats)));
        check(summary.present() == 9 && summary.absent() == 5 && summary.total() == 18);
        check(MireaAcademicApi.attendanceSummary(MireaAcademicApi.fields(message(2, number(1, 3)))) == null);
        byte[] dailyLesson = concat(message(2, number(1, START)), message(4,
            message(2, "Философия".getBytes(java.nio.charset.StandardCharsets.UTF_8))));
        var daily = MireaAcademicApi.parseDailyMarks(MireaAcademicApi.fields(
            message(1, concat(message(3, dailyLesson), message(4, number(2, 1))))));
        check(daily.size() == 1 && daily.get(0).type() == 3 && daily.get(0).start() == START);
        System.out.println("PASS attendance journals, nesting, confirmed empty, parse/network failures and retry");
    }

    @FunctionalInterface interface Run { void run() throws IOException; }
    private static void expectFailure(String code, Run run) throws IOException {
        try { run.run(); throw new AssertionError("Expected attendance error " + code); }
        catch (MireaAcademicApi.AttendanceFailure failure) { check(code.equals(failure.code)); }
    }
    private static void check(boolean value) { if (!value) throw new AssertionError(); }
    private static byte[] message(int field, byte[] data) throws IOException {
        return concat(varint(field << 3 | 2), varint(data.length), data);
    }
    private static byte[] number(int field, long data) throws IOException {
        return concat(varint(field << 3), varint(data));
    }
    private static byte[] concat(byte[]... items) throws IOException {
        var output = new ByteArrayOutputStream();
        for (byte[] item : items) output.write(item);
        return output.toByteArray();
    }
    private static byte[] varint(long value) {
        var output = new ByteArrayOutputStream();
        while (value > 127) {
            output.write((int) value | 128);
            value >>>= 7;
        }
        output.write((int) value);
        return output.toByteArray();
    }
}
