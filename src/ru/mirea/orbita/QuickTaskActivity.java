package ru.mirea.orbita;

import android.app.Activity;
import android.app.DatePickerDialog;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputFilter;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.ArrayAdapter;
import android.widget.AutoCompleteTextView;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;

/** A floating launcher form. Saving stays in the launcher and never starts MainActivity. */
public class QuickTaskActivity extends Activity {
    private static final ZoneId MOSCOW = ZoneId.of("Europe/Moscow");
    private SharedPreferences preferences;
    private JSONObject snapshot, original;
    private AutoCompleteTextView kindInput, subjectInput;
    private EditText numberInput, commentInput;
    private CheckBox majorInput;
    private TextView dateLabel, status, saveButton;
    private LinearLayout dates;
    private int background, foreground, muted, accent, onAccent, surface;
    private String due = "", dateChoice = "none";
    private boolean ready, saved, majorTouched;
    private final List<TextView> dateButtons = new ArrayList<>();

    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private int parseColor(String value, int fallback) {
        try { return value.matches("#[a-fA-F0-9]{6}") ? Color.parseColor(value) : fallback; }
        catch (Exception invalid) { return fallback; }
    }
    private int blend(int a, int b, float amount) {
        return Color.rgb(Math.round(Color.red(a)*(1-amount)+Color.red(b)*amount),
            Math.round(Color.green(a)*(1-amount)+Color.green(b)*amount),
            Math.round(Color.blue(a)*(1-amount)+Color.blue(b)*amount));
    }
    private GradientDrawable shape(int color, int radius) {
        GradientDrawable result = new GradientDrawable();
        result.setColor(color); result.setCornerRadius(dp(radius)); return result;
    }
    private TextView label(String text, int size, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text); view.setTextSize(size); view.setTextColor(foreground);
        if (bold) view.setTypeface(null, Typeface.BOLD);
        return view;
    }
    private TextView button(String text) {
        TextView view=label(text,14,false);
        view.setGravity(Gravity.CENTER);view.setMinHeight(dp(44));
        view.setPadding(dp(12),dp(8),dp(12),dp(8));
        view.setBackground(shape(surface,14));
        view.setFocusable(true);view.setClickable(true);
        return view;
    }
    private void fieldStyle(EditText input, int max) {
        input.setTextSize(15);input.setTextColor(foreground);input.setHintTextColor(muted);
        input.setPadding(dp(14),dp(10),dp(14),dp(10));input.setMinHeight(dp(48));
        input.setBackground(shape(surface,14));
        input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(max)});
    }
    private void addLabel(LinearLayout parent, String title) {
        TextView view=label(title,12,false);view.setTextColor(muted);
        view.setPadding(0,dp(14),0,dp(7));parent.addView(view);
    }
    private AutoCompleteTextView choices(LinearLayout parent, String title, List<String> items, int id, int max) {
        addLabel(parent,title);
        AutoCompleteTextView input=new AutoCompleteTextView(this);
        input.setId(id);input.setSingleLine(true);input.setThreshold(0);fieldStyle(input,max);
        input.setSelectAllOnFocus(true);
        input.setDropDownBackgroundDrawable(shape(surface,14));
        input.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_dropdown_item_1line,items){
            @Override public View getView(int position, View recycled, ViewGroup container) {
                TextView row=(TextView)super.getView(position,recycled,container);
                row.setTextColor(foreground);row.setTextSize(14);row.setMaxLines(2);row.setMinHeight(dp(44));
                return row;
            }
        });
        LinearLayout split=new LinearLayout(this);
        split.addView(input,new LinearLayout.LayoutParams(0,dp(48),1));
        TextView arrow=button("▼");
        arrow.setTextColor(accent);arrow.setBackground(shape(surface,14));
        arrow.setContentDescription("Шаблоны: "+title);
        LinearLayout.LayoutParams arrowSize=new LinearLayout.LayoutParams(dp(48),dp(48));
        arrowSize.setMarginStart(dp(7));split.addView(arrow,arrowSize);
        arrow.setOnClickListener(view->showPresets(arrow,input,items,id==R.id.quick_work_subject,max));
        parent.addView(split,new LinearLayout.LayoutParams(-1,-2));
        return input;
    }

    private void showPresets(View anchor, AutoCompleteTextView input, List<String> items, boolean subject, int max) {
        if(isFinishing())return;
        int theme=Color.luminance(background)<.179 ? android.R.style.Theme_Material : android.R.style.Theme_Material_Light;
        android.view.ContextThemeWrapper themed=new android.view.ContextThemeWrapper(this,theme);
        android.widget.PopupMenu menu=new android.widget.PopupMenu(themed,anchor);
        menu.getMenu().add(0,1,0,"＋ Свой вариант");
        for(String option:items)menu.getMenu().add(option);
        menu.setOnMenuItemClickListener(item->{
            if(item.getItemId()!=1){input.setText(item.getTitle(),false);return true;}
            EditText name=new EditText(themed);
            name.setSingleLine(true);name.setHint("Название шаблона");fieldStyle(name,max);
            name.setText(input.getText());
            android.app.AlertDialog dialog=new android.app.AlertDialog.Builder(themed)
                .setTitle("Свой вариант").setView(name).setNegativeButton("Отмена",null)
                .setPositiveButton("Сохранить",null).create();
            dialog.setOnShowListener(opened->dialog.getButton(android.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener(view->{
                String value=name.getText().toString().trim().replaceAll("\\s+"," ");
                if(value.isEmpty()){name.setError("Введи название");return;}
                if(!items.contains(value)&&!WidgetTasks.addPreset(preferences,subject,value)){name.setError("Не удалось сохранить шаблон");return;}
                if(!items.contains(value))items.add(value);
                input.setText(value,false);dialog.dismiss();
            }));
            dialog.show();
            return true;
        });
        menu.show();
    }

    private void appendPresets(java.util.Collection<String> items, boolean subject) {
        try {
            JSONArray names=new JSONArray(WidgetTasks.presets(preferences,subject));
            for(int i=0;i<names.length();i++){
                String name=names.optString(i);
                if(!name.isEmpty()&&!items.contains(name))items.add(name);
            }
        }catch(org.json.JSONException ignored){}
    }

    @Override public void onCreate(Bundle restored) {
        super.onCreate(restored);
        String action=getIntent().getStringExtra("widgetAction");
        if (!OrbitWidget.actionKey(this).equals(getIntent().getStringExtra("widgetKey"))) { finish(); return; }
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        preferences=getSharedPreferences("orbita",MODE_PRIVATE);
        try { snapshot=new JSONObject(WidgetTasks.read(preferences)); }
        catch (Exception empty) { snapshot=new JSONObject(); }
        if ("edit".equals(action)) {
            original = WidgetTasks.find(snapshot,getIntent().getStringExtra("workId"));
            if (restored!=null && restored.containsKey("original")) {
                try { original = new JSONObject(restored.getString("original")); }
                catch (org.json.JSONException invalid) { original = null; }
            }
            if(original==null || original.optBoolean("done")){
                android.widget.Toast.makeText(this,"Задача уже выполнена или удалена",android.widget.Toast.LENGTH_SHORT).show();
                finish();return;
            }
        }
        String theme=snapshot.optString("theme","dark");
        background="dark".equals(theme)?Color.BLACK:0xfff4f5f9;
        accent="dark".equals(theme)?0xffa9c4ff:0xff7060dc;
        if("green".equals(theme))accent=0xff718967;
        if("pink".equals(theme))accent=0xffbb7f9d;
        if("blue".equals(theme))accent=0xff638cbd;
        JSONObject custom=snapshot.optJSONObject("customAppearance");
        boolean customMode = "custom".equals(snapshot.optString("appearanceMode")) && custom != null;
        if (customMode) {
            background = CustomColors.background(parseColor(custom.optString("background"), background));
            accent = CustomColors.accent(parseColor(custom.optString("accent"), accent), background, CustomColors.panel(background));
        }
        foreground=Color.luminance(background)<.179?Color.WHITE:0xff17191e;
        onAccent=Color.luminance(accent)<.179?Color.WHITE:Color.BLACK;
        surface=customMode?CustomColors.panel(background):blend(background,foreground,.075f);muted=blend(background,foreground,.65f);

        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);root.setPadding(dp(18),dp(12),dp(18),dp(16));
        root.setBackground(shape(background,26));
        LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);
        header.addView(label(original==null?"Добавить работу":"Изменить работу",21,true),new LinearLayout.LayoutParams(0,-2,1));
        TextView close=button("×");close.setTextSize(25);close.setContentDescription("Закрыть без сохранения");
        close.setOnClickListener(view->finish());
        header.addView(close,new LinearLayout.LayoutParams(dp(44),dp(44)));root.addView(header);

        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(false);
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(form);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));

        List<String> kinds=new ArrayList<>();
        for(String kind:new String[]{"Лабораторная","Практическая","Чертёж","Конспект","Контрольная","Отчёт",
            "Домашнее задание","Курсовая","Подготовка к зачёту","Презентация"})kinds.add(kind);
        JSONArray customKinds=snapshot.optJSONArray("customWorkTypes");
        for(int i=0;customKinds!=null&&i<customKinds.length();i++){
            String kind=customKinds.optString(i);if(!kind.isEmpty()&&!kinds.contains(kind))kinds.add(kind);
        }
        appendPresets(kinds,false);
        kindInput=choices(form,"Что сделать",kinds,R.id.quick_work_kind,60);
        kindInput.setText(kinds.get(0),false);

        LinkedHashSet<String> subjects=new LinkedHashSet<>();
        JSONObject schedule=snapshot.optJSONObject("widgetCourseDays");
        if(schedule==null)schedule=snapshot.optJSONObject("widgetDays");
        if(schedule!=null){
            java.util.Iterator<String> keys=schedule.keys();
            while(keys.hasNext()){
                JSONArray rows=schedule.optJSONArray(keys.next());
                for(int i=0;rows!=null&&i<rows.length();i++){
                    JSONObject row=rows.optJSONObject(i);
                    if(row!=null&&!row.optString("title").isEmpty())subjects.add(row.optString("title"));
                }
            }
        }
        JSONArray tasks=snapshot.optJSONArray("tasks");
        for(int i=0;tasks!=null&&i<tasks.length();i++){
            JSONObject task=tasks.optJSONObject(i);
            if(task!=null&&!task.optString("subject").isEmpty())subjects.add(task.optString("subject"));
        }
        appendPresets(subjects,true);
        subjects.add("Личное");
        subjectInput=choices(form,"Предмет",new ArrayList<>(subjects),R.id.quick_work_subject,160);
        subjectInput.setText(subjects.iterator().next(),false);
        addLabel(form,"Когда сдать");
        HorizontalScrollView dateScroll=new HorizontalScrollView(this);dateScroll.setHorizontalScrollBarEnabled(false);
        dates=new LinearLayout(this);
        dateScroll.addView(dates);form.addView(dateScroll);
        addDate("Сегодня","today");addDate("Завтра","tomorrow");addDate("К следующей паре","next");
        addDate("Дата…","choose");addDate("Без срока","none");
        dateLabel=label("",12,false);dateLabel.setTextColor(muted);dateLabel.setPadding(0,dp(8),0,dp(4));
        form.addView(dateLabel);

        numberInput=new EditText(this);numberInput.setId(R.id.quick_work_number);
        numberInput.setHint("Номер · необязательно");numberInput.setSingleLine(true);fieldStyle(numberInput,30);
        form.addView(numberInput);
        commentInput=new EditText(this);commentInput.setId(R.id.quick_work_comment);
        commentInput.setHint("Подробности · необязательно");commentInput.setMaxLines(3);fieldStyle(commentInput,1000);
        LinearLayout.LayoutParams commentLayout=new LinearLayout.LayoutParams(-1,-2);commentLayout.topMargin=dp(8);
        form.addView(commentInput,commentLayout);
        majorInput=new CheckBox(this);majorInput.setId(R.id.quick_work_major);majorInput.setText("Крупная работа");
        majorInput.setTextColor(foreground);majorInput.setTextSize(14);majorInput.setMinHeight(dp(44));
        majorInput.setButtonTintList(android.content.res.ColorStateList.valueOf(accent));form.addView(majorInput);
        majorInput.setOnClickListener(view->majorTouched=true);

        status=label("",12,false);status.setId(R.id.quick_work_status);status.setTextColor(muted);
        status.setVisibility(View.GONE);root.addView(status);
        saveButton=button(original==null?"Добавить":"Сохранить");saveButton.setId(R.id.quick_work_save);
        saveButton.setTextColor(onAccent);saveButton.setBackground(shape(accent,16));
        saveButton.setOnClickListener(view->saveWork());root.addView(saveButton,new LinearLayout.LayoutParams(-1,dp(48)));
        setContentView(root);
        getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        WindowManager.LayoutParams window=getWindow().getAttributes();window.dimAmount=.3f;
        window.width=Math.min(dp(440),getResources().getDisplayMetrics().widthPixels-dp(24));
        window.height=Math.min(dp(610),(int)(getResources().getDisplayMetrics().heightPixels*.85));
        window.gravity=Gravity.CENTER;getWindow().setAttributes(window);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
        root.setFocusableInTouchMode(true);root.requestFocus();
        if(restored!=null){
            kindInput.setText(restored.getString("kind","Лабораторная"),false);
            subjectInput.setText(restored.getString("subject","Личное"),false);
            numberInput.setText(restored.getString("number",""));commentInput.setText(restored.getString("comment",""));
            due=restored.getString("due","");dateChoice=restored.getString("dateChoice","none");
            majorInput.setChecked(restored.getBoolean("major"));majorTouched=restored.getBoolean("majorTouched");
        }else if(original!=null){
            kindInput.setText(originalKind(),false);
            subjectInput.setText(original.optString("subject","Личное"),false);
            numberInput.setText(originalNumber());commentInput.setText(original.optString("comment"));
            due=original.optString("dueISO");
            dateChoice=due.isEmpty()?"none":"choose";
            majorTouched=original.has("major");
            majorInput.setChecked(original.optBoolean("major","Курсовая".equals(originalKind())));
        }else if("addDue".equals(action)||"addDuePreset".equals(action)){
            due=LocalDate.now(MOSCOW).toString();dateChoice="today";
        }
        paintDate();ready=true;
        TextWatcher changes=new TextWatcher(){
            @Override public void beforeTextChanged(CharSequence s,int start,int count,int after) {}
            @Override public void onTextChanged(CharSequence s,int start,int before,int count) {
                if(!ready)return;
                if(!majorTouched)majorInput.setChecked("Курсовая".equals(kindInput.getText().toString()));
                if("next".equals(dateChoice))chooseNext();
            }
            @Override public void afterTextChanged(Editable text) {}
        };
        kindInput.addTextChangedListener(changes);subjectInput.addTextChangedListener(changes);
        if(restored==null && action!=null && action.endsWith("Preset"))
            kindInput.post(()->showPresets(kindInput,kindInput,kinds,false,60));
    }

    private void addDate(String title, String key) {
        TextView view=button(title);view.setTag(key);
        LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(-2,dp(44));size.setMarginEnd(dp(6));
        dates.addView(view,size);dateButtons.add(view);
        view.setOnClickListener(v->{
            if("choose".equals(key)){
                LocalDate initial=due.isEmpty()?LocalDate.now(MOSCOW):LocalDate.parse(due);
                new DatePickerDialog(this,(picker,year,month,day)->{
                    due=LocalDate.of(year,month+1,day).toString();dateChoice=key;paintDate();
                },initial.getYear(),initial.getMonthValue()-1,initial.getDayOfMonth()).show();
                return;
            }
            dateChoice=key;
            if("next".equals(key)){chooseNext();return;}
            due="none".equals(key)?"":LocalDate.now(MOSCOW).plusDays("tomorrow".equals(key)?1:0).toString();
            paintDate();
        });
    }

    static String nextDate(JSONObject state, String subject, String kind, LocalDate today, LocalTime now) {
        JSONObject own=state.optJSONObject("pinnedGroup");
        if(own==null)own=state.optJSONObject("officialGroup");
        if(own==null)return "";
        String groupKey=own.optInt("target")+":"+own.optString("id");
        if(!groupKey.equals(state.optString("widgetGroupKey")))return "";
        JSONObject schedule=state.optJSONObject("widgetCourseDays");
        if(schedule==null)schedule=state.optJSONObject("widgetDays");
        if(schedule==null)return "";
        String required="Лабораторная".equals(kind)?"Лабораторная работа":
            ("Практическая".equals(kind)||"Чертёж".equals(kind))?"Практическое занятие":"";
        for(int offset=0;offset<35;offset++){
            String key=today.plusDays(offset).toString();
            JSONArray lessons=schedule.optJSONArray(key);
            for(int i=0;lessons!=null&&i<lessons.length();i++){
                JSONObject lesson=lessons.optJSONObject(i);
                if(lesson==null||!subject.equals(lesson.optString("title")))continue;
                String type=lesson.optString("type");
                if("Лекция".equals(type)||(!required.isEmpty()&&!required.equals(type)))continue;
                try {
                    if(offset>0||LocalTime.parse(lesson.optString("start")).isAfter(now))return key;
                }catch(java.time.format.DateTimeParseException ignored){}
            }
        }
        return "";
    }

    private void chooseNext() {
        due=nextDate(snapshot,subjectInput.getText().toString().trim(),kindInput.getText().toString().trim(),
            LocalDate.now(MOSCOW),LocalTime.now(MOSCOW));
        paintDate();
        if(due.isEmpty())dateLabel.setText("Подходящая пара не найдена. Выбери дату.");
    }

    private void paintDate() {
        dateLabel.setText(due.isEmpty()?"Без срока":LocalDate.parse(due).format(DateTimeFormatter.ofPattern("d MMMM yyyy",new Locale("ru"))));
        for(TextView button:dateButtons){
            boolean selected=dateChoice.equals(button.getTag());
            button.setBackground(shape(selected?accent:surface,14));button.setTextColor(selected?onAccent:foreground);
            button.setSelected(selected);
        }
    }

    private String originalKind() {
        return original.optString("kind",original.optString("text","Работа"));
    }

    private String originalNumber() {
        String prefix=originalKind()+" ", title=original.optString("text");
        return title.startsWith(prefix)?title.substring(prefix.length()):"";
    }

    private void saveWork() {
        if(saved)return;
        String kind=kindInput.getText().toString().trim(),subject=subjectInput.getText().toString().trim();
        if(kind.isEmpty()||subject.isEmpty()){error("Выбери вид работы и предмет");return;}
        if("next".equals(dateChoice)){
            chooseNext();if(due.isEmpty()){error("Выбери срок — подходящая пара не найдена");return;}
        }
        try {
            String number=numberInput.getText().toString().trim();
            String title=original!=null&&kind.equals(originalKind())&&number.equals(originalNumber())
                ?original.optString("text"):kind+(number.isEmpty()?"":" "+number);
            JSONObject task=new JSONObject().put("kind",kind).put("subject",subject)
                .put("text",title)
                .put("comment",commentInput.getText().toString().trim()).put("major",majorInput.isChecked())
                .put("dueISO",due).put("due",due.isEmpty()?"Без срока":LocalDate.parse(due).format(DateTimeFormatter.ofPattern("d MMMM",new Locale("ru"))));
            saveButton.setEnabled(false);
            boolean stored = original==null ? WidgetTasks.add(preferences,task)!=null : WidgetTasks.edit(preferences,original,task);
            if(!stored){
                saveButton.setEnabled(true);
                error(original==null?"Не удалось сохранить. Попробуй ещё раз.":"Задача изменилась. Закрой окно и открой её заново.");
                return;
            }
            saved=true;OrbitWidget.updateAll(this);finish();
        }catch(Exception invalid){saveButton.setEnabled(true);error("Проверь поля и попробуй ещё раз.");}
    }
    private void error(String message){status.setVisibility(View.VISIBLE);status.setText(message);}

    @Override protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if(kindInput==null)return;
        if(original!=null)out.putString("original",original.toString());
        out.putString("kind",kindInput.getText().toString());out.putString("subject",subjectInput.getText().toString());
        out.putString("number",numberInput.getText().toString());out.putString("comment",commentInput.getText().toString());
        out.putString("due",due);out.putString("dateChoice",dateChoice);
        out.putBoolean("major",majorInput.isChecked());out.putBoolean("majorTouched",majorTouched);
    }
}
