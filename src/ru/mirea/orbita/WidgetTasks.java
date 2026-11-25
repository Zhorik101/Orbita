package ru.mirea.orbita;

import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Personal task writes from the launcher and the WebView share the same transaction lock. */
final class WidgetTasks {
    static final String REVISION = "widgetTaskRevision";
    static final String UNDO_ID = "widgetUndoWork";
    private static final String STATE = "state";

    private WidgetTasks() {}

    static synchronized String read(SharedPreferences prefs) {
        String raw = prefs.getString(STATE, "");
        if (raw.isEmpty()) return raw;
        try {
            JSONObject state = new JSONObject(raw);
            JSONArray tasks = state.optJSONArray("tasks");
            Set<String> ids = new HashSet<>();
            boolean upgraded = false;
            for (int i = 0; tasks != null && i < tasks.length(); i++) {
                JSONObject task = tasks.optJSONObject(i);
                if (task == null) continue;
                String id = task.optString("workId");
                if (!id.isEmpty() && ids.add(id)) continue;
                String newId = "work_" + UUID.randomUUID();
                ids.add(newId);
                task.put("workId", newId);
                upgraded = true;
            }
            if (upgraded) {
                String updated = state.toString();
                if (prefs.edit().putString(STATE, updated).commit()) return updated;
            }
        } catch (JSONException ignored) {
            // The client can still recover its local copy if the stored JSON is unreadable.
        }
        return raw;
    }

    static synchronized String presets(SharedPreferences prefs, boolean subject) {
        String key = subject ? "subjectPresets" : "workPresets";
        try { return new JSONArray(prefs.getString(key, "[]")).toString(); }
        catch (JSONException invalid) { return "[]"; }
    }

    static synchronized boolean addPreset(SharedPreferences prefs, boolean subject, String name) {
        if (name == null) return false;
        name = name.trim();
        if (name.isEmpty() || name.length() > (subject ? 160 : 60)) return false;
        try {
            JSONArray names = new JSONArray(presets(prefs, subject));
            for (int i = 0; i < names.length(); i++)
                if (names.optString(i).equalsIgnoreCase(name)) return true;
            if (names.length() >= 30) return false;
            return prefs.edit().putString(subject ? "subjectPresets" : "workPresets",
                names.put(name).toString()).commit();
        } catch (JSONException invalid) { return false; }
    }

    static JSONObject find(JSONObject state, String id) {
        if (id == null || id.isEmpty()) return null;
        JSONArray tasks = state.optJSONArray("tasks");
        for (int i = 0; tasks != null && i < tasks.length(); i++) {
            JSONObject task = tasks.optJSONObject(i);
            if (task != null && id.equals(task.optString("workId"))) return task;
        }
        return null;
    }

    private static final String EDIT_REVISION = "widgetEditedRevision";
    private static final String[] EDITABLE_FIELDS = {"text","kind","subject","due","dueISO","comment","major"};

    private static void copyEdit(JSONObject from, JSONObject to) throws JSONException {
        for (String field : EDITABLE_FIELDS) if (from.has(field)) to.put(field, from.get(field));
        to.put(EDIT_REVISION, from.getLong(EDIT_REVISION));
    }

    static synchronized boolean edit(SharedPreferences prefs, JSONObject original, JSONObject fields) {
        try {
            JSONObject state = new JSONObject(prefs.getString(STATE, "{}"));
            JSONObject task = find(state, original.optString("workId"));
            if (task == null || task.optBoolean("done")) return false;
            for (String field : EDITABLE_FIELDS) {
                if (!java.util.Objects.equals(task.opt(field), original.opt(field))) return false;
            }
            long revision = prefs.getLong(REVISION, 0) + 1;
            fields.put(EDIT_REVISION, revision);
            copyEdit(fields, task);
            task.put(REVISION, revision);
            state.put(REVISION, revision);
            String json = state.toString();
            if (json.length() > 2000000) return false;
            return prefs.edit().putString(STATE,json).putLong(REVISION,revision).commit();
        } catch (JSONException invalid) { return false; }
    }

    private static JSONObject changes(JSONObject stored, long since) throws JSONException {
        JSONArray affected = new JSONArray();
        JSONArray tasks = stored.optJSONArray("tasks");
        for (int i = 0; tasks != null && i < tasks.length(); i++) {
            JSONObject task = tasks.optJSONObject(i);
            if (task == null || task.optLong(REVISION) <= since) continue;
            if (task.optLong("widgetCreatedRevision") > since) affected.put(new JSONObject(task.toString()));
            else {
                JSONObject patch = new JSONObject().put("workId", task.getString("workId"))
                    .put("done", task.optBoolean("done")).put(REVISION, task.getLong(REVISION));
                if (task.optLong(EDIT_REVISION) > since) copyEdit(task,patch);
                affected.put(patch);
            }
        }
        return new JSONObject().put(REVISION, stored.optLong(REVISION)).put("tasks", affected);
    }

    static synchronized String changesSince(SharedPreferences prefs, long since) {
        if (prefs.getLong(REVISION, 0) <= since) return "{}";
        try {
            return changes(new JSONObject(prefs.getString(STATE, "{}")), since).toString();
        } catch (JSONException unreadable) {
            return "{}";
        }
    }

    /** Return changed task statuses to the caller, or null on failure. Other edits stay intact. */
    static synchronized String saveFromApp(SharedPreferences prefs, String json) {
        if (json == null || json.length() > 2000000) return null;
        try {
            JSONObject incoming = new JSONObject(json);
            if (!incoming.has("group") || incoming.optString("group").length() > 32) return null;
            long since = incoming.optLong(REVISION);
            long revision = prefs.getLong(REVISION, 0);
            JSONObject patch = new JSONObject();
            if (since < revision) {
                patch = changes(new JSONObject(prefs.getString(STATE, "{}")), since);
                Map<String, JSONObject> updates = new HashMap<>();
                JSONArray statuses = patch.getJSONArray("tasks");
                for (int i = 0; i < statuses.length(); i++) {
                    JSONObject update = statuses.getJSONObject(i);
                    updates.put(update.getString("workId"), update);
                }
                JSONArray tasks = incoming.optJSONArray("tasks");
                for (int i = 0; tasks != null && i < tasks.length(); i++) {
                    JSONObject task = tasks.optJSONObject(i);
                    if (task == null) continue;
                    JSONObject update = updates.get(task.optString("workId"));
                    if (update != null) {
                        task.put("done", update.getBoolean("done"));
                        task.put(REVISION, update.getLong(REVISION));
                        if (update.optLong(EDIT_REVISION) > since) copyEdit(update,task);
                    }
                }
                if (tasks == null) { tasks = new JSONArray(); incoming.put("tasks", tasks); }
                for (JSONObject update : updates.values()) {
                    if (update.optLong("widgetCreatedRevision") > since && find(incoming, update.optString("workId")) == null)
                        tasks.put(new JSONObject(update.toString()));
                }
                incoming.put(REVISION, revision);
                json = incoming.toString();
            }
            SharedPreferences.Editor editor = prefs.edit().putString(STATE, json);
            // Recover an intact WebView copy if native preferences were reset.
            if (since > revision) editor.putLong(REVISION, since);
            String lastId = prefs.getString(UNDO_ID, null);
            if (lastId != null) {
                JSONObject last = find(incoming, lastId);
                if (last == null || !last.optBoolean("done")) editor.remove(UNDO_ID);
            }
            return editor.commit() ? patch.toString() : null;
        } catch (JSONException invalid) {
            return null;
        }
    }

    static synchronized String add(SharedPreferences prefs, JSONObject fields) {
        try {
            JSONObject state = new JSONObject(prefs.getString(STATE, "{}"));
            JSONArray tasks = state.optJSONArray("tasks");
            if (tasks == null) { tasks = new JSONArray(); state.put("tasks", tasks); }
            String id = "work_" + UUID.randomUUID();
            long revision = prefs.getLong(REVISION, 0) + 1;
            JSONObject task = new JSONObject(fields.toString());
            task.put("workId", id).put("done", false).put(REVISION, revision).put("widgetCreatedRevision", revision);
            tasks.put(task);
            state.put(REVISION, revision);
            if (!state.has("group")) state.put("group", "");
            String json = state.toString();
            if (json.length() > 2000000) return null;
            return prefs.edit().putString(STATE, json).putLong(REVISION, revision).commit() ? id : null;
        } catch (JSONException invalid) {
            return null;
        }
    }

    /** A stale launcher view, a double tap or an old undo can never flip a different work. */
    static synchronized boolean act(SharedPreferences prefs, String id, long expected, boolean complete) {
        try {
            JSONObject state = new JSONObject(prefs.getString(STATE, "{}"));
            JSONObject task = find(state, id);
            if (task == null || task.optLong(REVISION) != expected || task.optBoolean("done") == complete)
                return false;
            if (!complete && !id.equals(prefs.getString(UNDO_ID, null))) return false;
            long revision = prefs.getLong(REVISION, 0) + 1;
            task.put("done", complete).put(REVISION, revision);
            state.put(REVISION, revision);
            SharedPreferences.Editor editor = prefs.edit()
                .putString(STATE, state.toString())
                .putLong(REVISION, revision);
            if (complete) editor.putString(UNDO_ID, id);
            else editor.remove(UNDO_ID);
            return editor.commit();
        } catch (JSONException invalid) {
            return false;
        }
    }
}
