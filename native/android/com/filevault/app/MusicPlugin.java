package com.filevault.app;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/** Bridge between the web app and MusicService. */
@CapacitorPlugin(name = "FileVaultMusic")
public class MusicPlugin extends Plugin {

  @Override
  public void load() {
    MusicService.listener = kind -> {
      JSObject state = stateObject();
      if ("error".equals(kind)) notifyListeners("error", state);
      else notifyListeners("state", state);
    };
  }

  private JSObject stateObject() {
    JSObject o = new JSObject();
    MusicService s = MusicService.instance;
    if (s == null) {
      o.put("index", -1); o.put("playing", false); o.put("position", 0); o.put("duration", 0);
      o.put("shuffle", false); o.put("repeat", "off");
      return o;
    }
    o.put("index", s.getIndex());
    o.put("playing", s.getPlaying());
    o.put("position", s.getPosMs());
    o.put("duration", s.getDurMs());
    o.put("shuffle", s.getShuffle());
    o.put("repeat", s.getRepeat());
    MusicService.Track t = s.currentTrack();
    if (t != null) { o.put("path", t.path); o.put("title", t.title); }
    return o;
  }

  @PluginMethod
  public void setQueue(PluginCall call) {
    JSArray items = call.getArray("items");
    if (items == null || items.length() == 0) { call.reject("The queue is empty."); return; }
    try {
      List<MusicService.Track> list = new ArrayList<>();
      for (int i = 0; i < items.length(); i++) {
        JSONObject it = items.getJSONObject(i);
        MusicService.Track t = new MusicService.Track();
        t.path = it.getString("path");
        t.title = it.optString("title", "Unknown track");
        t.artist = it.optString("artist", "FileVault");
        list.add(t);
      }
      MusicService.pending = list;
      MusicService.pendingIndex = call.getInt("index", 0);
      MusicService.pendingPlay = call.getBoolean("play", true);
      MusicService.pendingShuffle = call.getBoolean("shuffle", false);
      MusicService.pendingRepeat = call.getString("repeat", "off");
      if (Build.VERSION.SDK_INT >= 33 && getActivity() != null
          && ContextCompat.checkSelfPermission(getContext(), "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
        ActivityCompat.requestPermissions(getActivity(), new String[]{"android.permission.POST_NOTIFICATIONS"}, 4712);
      }
      Intent intent = new Intent(getContext(), MusicService.class).setAction(MusicService.A_LOAD);
      ContextCompat.startForegroundService(getContext(), intent);
      call.resolve();
    } catch (Exception e) { call.reject("Could not start music playback: " + e.getMessage()); }
  }

  @PluginMethod
  public void notifStatus(PluginCall call) {
    JSObject o = new JSObject();
    boolean enabled = androidx.core.app.NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    boolean channelOn = true;
    if (Build.VERSION.SDK_INT >= 26) {
      android.app.NotificationManager nm = (android.app.NotificationManager) getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
      android.app.NotificationChannel ch = nm == null ? null : nm.getNotificationChannel(MusicService.CHANNEL);
      if (ch != null && ch.getImportance() == android.app.NotificationManager.IMPORTANCE_NONE) channelOn = false;
    }
    o.put("enabled", enabled);
    o.put("channel", channelOn);
    o.put("sdk", Build.VERSION.SDK_INT);
    o.put("service", MusicService.instance != null);
    boolean posted = false;
    int importance = -1;
    try {
      android.app.NotificationManager nm = (android.app.NotificationManager) getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
      if (Build.VERSION.SDK_INT >= 23) {
        for (android.service.notification.StatusBarNotification sn : nm.getActiveNotifications()) { if (sn.getId() == MusicService.NOTIF_ID) posted = true; }
      }
      if (Build.VERSION.SDK_INT >= 26) {
        android.app.NotificationChannel ch = nm.getNotificationChannel(MusicService.CHANNEL);
        if (ch != null) importance = ch.getImportance();
      }
    } catch (Exception e) { }
    o.put("posted", posted);
    o.put("importance", importance);
    MusicService live = MusicService.instance;
    o.put("playing", live != null && live.getPlaying());
    o.put("error", MusicService.lastError == null ? "" : MusicService.lastError);
    call.resolve(o);
  }

  @PluginMethod
  public void refresh(PluginCall call) {
    final MusicService s = MusicService.instance;
    if (s != null) s.run(() -> s.refresh());
    call.resolve();
  }

  @PluginMethod
  public void testNotification(PluginCall call) {
    try {
      android.content.Context c = getContext();
      android.app.NotificationManager nm = (android.app.NotificationManager) c.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
      if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(new android.app.NotificationChannel("filevault_test", "Test notification", android.app.NotificationManager.IMPORTANCE_DEFAULT));
      android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new android.app.Notification.Builder(c, "filevault_test") : new android.app.Notification.Builder(c);
      b.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("FileVault test").setContentText("If you can read this, notifications work for FileVault.").setAutoCancel(true);
      nm.notify(4712, b.build());
      call.resolve();
    } catch (Exception e) { call.reject("Could not post a notification: " + e.getMessage()); }
  }

  @PluginMethod
  public void openNotifSettings(PluginCall call) {
    try {
      Intent i = new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
      i.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(i);
      call.resolve();
    } catch (Exception e) { call.reject("Could not open notification settings: " + e.getMessage()); }
  }

  @PluginMethod
  public void openAppSettings(PluginCall call) {
    try {
      Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
      i.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(i);
      call.resolve();
    } catch (Exception e) { call.reject("Could not open app settings: " + e.getMessage()); }
  }

  @PluginMethod public void toggle(PluginCall call) { final MusicService s = MusicService.instance; if (s != null) s.run(() -> { if (s.getPlaying()) s.pauseNow(); else s.playNow(); }); call.resolve(); }
  @PluginMethod public void play(PluginCall call) { final MusicService s = MusicService.instance; if (s != null) s.run(s::playNow); call.resolve(); }
  @PluginMethod public void pause(PluginCall call) { final MusicService s = MusicService.instance; if (s != null) s.run(s::pauseNow); call.resolve(); }
  @PluginMethod public void next(PluginCall call) { final MusicService s = MusicService.instance; if (s != null) s.run(() -> s.nextNow(false)); call.resolve(); }
  @PluginMethod public void prev(PluginCall call) { final MusicService s = MusicService.instance; if (s != null) s.run(s::prevNow); call.resolve(); }
  @PluginMethod public void stop(PluginCall call) { final MusicService s = MusicService.instance; if (s != null) s.run(s::stopAll); call.resolve(); }

  @PluginMethod
  public void seek(PluginCall call) {
    final MusicService s = MusicService.instance;
    final int ms = call.getInt("ms", 0);
    if (s != null) s.run(() -> s.seekNow(ms));
    call.resolve();
  }

  @PluginMethod
  public void setMode(PluginCall call) {
    final MusicService s = MusicService.instance;
    final Boolean shuffle = call.hasOption("shuffle") ? call.getBoolean("shuffle", false) : null;
    final String repeat = call.getString("repeat");
    if (s != null) s.run(() -> s.setMode(shuffle, repeat));
    call.resolve();
  }

  @PluginMethod
  public void setSleep(PluginCall call) {
    final MusicService s = MusicService.instance;
    final int minutes = call.getInt("minutes", 0);
    if (s != null) s.run(() -> s.setSleepMinutes(minutes));
    call.resolve();
  }

  @PluginMethod
  public void getSleep(PluginCall call) {
    MusicService s = MusicService.instance;
    JSObject o = new JSObject();
    o.put("left", s == null ? 0 : s.getSleepLeftMs());
    call.resolve(o);
  }

  /** Band count, centre frequencies and level range of the device equalizer. */
  @PluginMethod
  public void eqInfo(PluginCall call) {
    android.media.MediaPlayer tmp = null;
    android.media.audiofx.Equalizer e = null;
    try {
      tmp = new android.media.MediaPlayer();
      e = new android.media.audiofx.Equalizer(0, tmp.getAudioSessionId());
      short n = e.getNumberOfBands();
      short[] range = e.getBandLevelRange();
      JSArray freqs = new JSArray();
      for (short b = 0; b < n; b++) freqs.put(e.getCenterFreq(b) / 1000);
      JSObject o = new JSObject();
      o.put("bands", (int) n);
      o.put("min", (int) range[0]);
      o.put("max", (int) range[1]);
      o.put("freqs", freqs);
      call.resolve(o);
    } catch (Exception ex) {
      call.reject("This device does not offer an equalizer: " + ex.getMessage());
    } finally {
      try { if (e != null) e.release(); } catch (Exception ignored) { }
      try { if (tmp != null) tmp.release(); } catch (Exception ignored) { }
    }
  }

  /** Save the equalizer settings (millibels per band) and apply them to the song that is playing. */
  @PluginMethod
  public void setEq(PluginCall call) {
    try {
      JSArray arr = call.getArray("levels");
      int[] lv = new int[arr == null ? 0 : arr.length()];
      for (int i = 0; i < lv.length; i++) lv[i] = arr.getInt(i);
      MusicService.eqLevelsS = lv;
      MusicService.eqEnabledS = call.getBoolean("enabled", false);
      final MusicService s = MusicService.instance;
      if (s != null) s.run(s::applyEq);
      call.resolve();
    } catch (Exception e) { call.reject("Could not apply the equalizer: " + e.getMessage()); }
  }

  @PluginMethod
  public void getState(PluginCall call) { call.resolve(stateObject()); }

  @PluginMethod
  public void getQueue(PluginCall call) {
    JSArray arr = new JSArray();
    MusicService s = MusicService.instance;
    if (s != null) {
      for (MusicService.Track t : s.queueCopy()) {
        JSObject o = new JSObject();
        o.put("path", t.path); o.put("title", t.title); o.put("artist", t.artist);
        arr.put(o);
      }
    }
    JSObject ret = new JSObject();
    ret.put("items", arr);
    call.resolve(ret);
  }
}
