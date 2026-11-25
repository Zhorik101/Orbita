package ru.mirea.orbita;
import android.content.*;
import android.database.Cursor;
import android.provider.CalendarContract;
import org.json.*;
import java.util.*;

/** Direct Calendar Provider import, scoped to events previously written by Orbita. */
public final class CalendarImport {
 public static boolean allowed(Context c){return c.checkSelfPermission("android.permission.READ_CALENDAR")==0&&c.checkSelfPermission("android.permission.WRITE_CALENDAR")==0;}
 public static String calendars(Context c){JSONObject result=new JSONObject();try{result.put("permission",allowed(c));JSONArray list=new JSONArray();if(allowed(c))try(Cursor cur=c.getContentResolver().query(CalendarContract.Calendars.CONTENT_URI,new String[]{"_id","calendar_displayName","account_name","account_type"},"calendar_access_level>=? AND visible=1",new String[]{String.valueOf(CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR)},"isPrimary DESC, calendar_displayName ASC")){if(cur!=null)while(cur.moveToNext()){JSONObject item=new JSONObject();item.put("id",cur.getLong(0));item.put("name",cur.getString(1));item.put("account",cur.getString(2));item.put("accountType",cur.getString(3));list.put(item);}}result.put("calendars",list);}catch(Exception e){try{result.put("error","Не удалось прочитать календари телефона");}catch(Exception ignored){}}return result.toString();}
 private static Set<String> googleEventColors(Context context, JSONObject calendar) {
  Set<String> colors = new HashSet<>();
  if (calendar == null || !"com.google".equals(calendar.optString("accountType"))) return colors;
  try (Cursor cursor = context.getContentResolver().query(CalendarContract.Colors.CONTENT_URI,
      new String[]{CalendarContract.Colors.COLOR_KEY},
      "account_name=? AND account_type=? AND color_type=?",
      new String[]{calendar.optString("account"), "com.google", String.valueOf(CalendarContract.Colors.TYPE_EVENT)}, null)) {
   while (cursor != null && cursor.moveToNext()) colors.add(cursor.getString(0));
  } catch (RuntimeException unavailable) {
   colors.clear();
  }
  return colors;
 }
 static String hash(String value)throws Exception{byte[] digest=java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes("UTF-8"));StringBuilder out=new StringBuilder();for(byte b:digest)out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return out.toString();}
 public static synchronized JSONObject perform(Context c,String payload)throws Exception{
  if(!allowed(c))throw new SecurityException("Нет разрешения на календарь");JSONObject data=new JSONObject(payload);long calendar=data.getLong("calendar"),from=data.getLong("from"),to=data.getLong("to");String scope=data.getString("scope");boolean tasks="tasks".equals(scope);JSONArray events=data.getJSONArray("events");if((!tasks&&!scope.matches("[1-3]:[0-9]{1,12}"))||from<=0||to<=from||(!tasks&&to-from>370L*86400000)||events.length()>3000)throw new Exception("Неверный период экспорта");JSONObject destination=null;JSONArray available=new JSONObject(calendars(c)).optJSONArray("calendars");if(available!=null)for(int i=0;i<available.length();i++)if(available.getJSONObject(i).getLong("id")==calendar)destination=available.getJSONObject(i);if(destination==null)throw new Exception("Выбранный календарь недоступен для записи");
  Set<String> palette=tasks?Collections.emptySet():googleEventColors(c,destination);
  Map<String,String> previousColors=new HashMap<>();
  ContentResolver resolver=c.getContentResolver();String prefix="orbita://schedule/"+scope+"/";Map<String,Long> existing=new HashMap<>(),inRange=new HashMap<>(); Map<String,List<Object>> previousValues=new HashMap<>();
  try(Cursor cur=resolver.query(CalendarContract.Events.CONTENT_URI,new String[]{"_id","customAppUri","dtstart","dtend","title","eventLocation","description","allDay","eventTimezone",CalendarContract.Events.EVENT_COLOR_KEY},"calendar_id=? AND customAppPackage=? AND deleted=0",new String[]{String.valueOf(calendar),c.getPackageName()},null)){if(cur!=null)while(cur.moveToNext()){String uri=cur.getString(1);if(uri!=null&&uri.startsWith(prefix)){existing.put(uri,cur.getLong(0));previousValues.put(uri,Arrays.asList(cur.getLong(2),cur.getLong(3),cur.getString(4),cur.getString(5),cur.getString(6),cur.getInt(7),cur.getString(8)));previousColors.put(uri,cur.getString(9));long at=cur.getLong(2);if(tasks||at>=from&&at<to)inRange.put(uri,cur.getLong(0));}}}
  ArrayList<ContentProviderOperation> operations=new ArrayList<>();Set<String> wanted=new HashSet<>();int added=0,updated=0,removed=0;
  for(int i=0;i<events.length();i++){JSONObject event=events.getJSONObject(i);long start=event.getLong("start"),end=event.getLong("end");String title=event.getString("title"),uid=event.getString("uid");if(start<from||start>=to||end<=start||end-start>86400000||title.length()>1000||uid.length()>2000||uid.isEmpty())throw new Exception("Некорректные данные занятия");String uri=prefix+hash(uid);if(!wanted.add(uri))continue;ContentValues values=new ContentValues();values.put("calendar_id",calendar);values.put("title",title);values.put("dtstart",start);values.put("dtend",end);values.put("eventTimezone",tasks?"UTC":"Europe/Moscow");values.put("allDay",tasks?1:0);values.put("eventLocation",event.optString("location"));values.put("description",event.optString("description"));values.put("customAppPackage",c.getPackageName());values.put("customAppUri",uri);String colorKey=event.optString("colorKey");boolean useColor=palette.contains(colorKey);if(useColor)values.put(CalendarContract.Events.EVENT_COLOR_KEY,colorKey);Long id=existing.get(uri);if(id==null){operations.add(ContentProviderOperation.newInsert(CalendarContract.Events.CONTENT_URI).withValues(values).build());added++;}else if(!Arrays.asList(start,end,title,event.optString("location"),event.optString("description"),tasks?1:0,tasks?"UTC":"Europe/Moscow").equals(previousValues.get(uri))||(useColor&&!colorKey.equals(previousColors.get(uri)))){operations.add(ContentProviderOperation.newUpdate(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI,id)).withValues(values).build());updated++;}}
  for(Map.Entry<String,Long> old:inRange.entrySet())if(!wanted.contains(old.getKey())){operations.add(ContentProviderOperation.newDelete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI,old.getValue())).build());removed++;}
  // Validate the entire import before the first write. Retrying a partial provider failure is idempotent.
  for(int offset=0;offset<operations.size();offset+=80){ArrayList<ContentProviderOperation> batch=new ArrayList<>(operations.subList(offset,Math.min(offset+80,operations.size())));resolver.applyBatch(CalendarContract.AUTHORITY,batch);}
  JSONObject result=new JSONObject();result.put("ok",true);result.put("added",added);result.put("updated",updated);result.put("removed",removed);return result;
 }
}
