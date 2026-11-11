package com.filevault.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/** Foreground service that owns music playback, so it keeps going with the screen off or the app closed. */
public class MusicService extends Service {
  static final String CHANNEL = "filevault_music2";
  static final int NOTIF_ID = 4711;
  static final String A_LOAD = "com.filevault.app.LOAD";
  static final String A_TOGGLE = "com.filevault.app.TOGGLE";
  static final String A_NEXT = "com.filevault.app.NEXT";
  static final String A_PREV = "com.filevault.app.PREV";
  static final String A_STOP = "com.filevault.app.STOP";

  public static class Track { public String path; public String title; public String artist; }
  public interface Listener { void onState(String kind); }

  public static volatile MusicService instance;
  public static volatile Listener listener;
  public static volatile String lastError = "";
  public static List<Track> pending;
  public static int pendingIndex;
  public static boolean pendingPlay = true;
  public static boolean pendingShuffle;
  public static String pendingRepeat = "off";

  private final List<Track> queue = new ArrayList<>();
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final Random random = new Random();
  private MediaPlayer player;
  private MediaSession session;
  private AudioManager audio;
  private BroadcastReceiver noisy;
  private boolean prepared = false;
  private boolean wantPlay = false;
  private boolean resumeOnFocus = false;
  private boolean foreground = false;
  private volatile int index = -1;
  private volatile boolean shuffle = false;
  private volatile String repeat = "off";
  private volatile int posMs = 0;
  private volatile int durMs = 0;
  private volatile boolean playingNow = false;
  private volatile long sleepAt = 0;
  private android.media.audiofx.Equalizer eq;
  public static volatile boolean eqEnabledS = false;
  public static volatile int[] eqLevelsS = null;

  private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
    if (change == AudioManager.AUDIOFOCUS_LOSS) {
      pauseNow();
    } else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
      if (isPlaying()) { resumeOnFocus = true; pauseNow(); }
    } else if (change == AudioManager.AUDIOFOCUS_GAIN) {
      if (resumeOnFocus) { resumeOnFocus = false; playNow(); }
    }
  };

  private final Runnable ticker = new Runnable() {
    @Override public void run() {
      if (sleepAt > 0 && System.currentTimeMillis() >= sleepAt) { sleepAt = 0; pauseNow(); }
      if (player != null && prepared && isPlaying()) { snapshot(); notifyState("tick"); }
      handler.postDelayed(this, 500);
    }
  };

  /* ---------- getters used by the plugin (thread safe) ---------- */
  /** Re-post the notification (used when the user returns after allowing notifications). */
  public void refresh() { updateAll("state"); }
  public int getIndex() { return index; }
  public boolean getPlaying() { return playingNow; }
  public int getPosMs() { return posMs; }
  public int getDurMs() { return durMs; }
  public boolean getShuffle() { return shuffle; }
  public String getRepeat() { return repeat; }
  /** Sleep timer: minutes from now, 0 turns it off. */
  public void setSleepMinutes(int minutes) { sleepAt = minutes > 0 ? System.currentTimeMillis() + minutes * 60000L : 0; }
  public long getSleepLeftMs() { return sleepAt > 0 ? Math.max(0, sleepAt - System.currentTimeMillis()) : 0; }
  public Track currentTrack() {
    List<Track> q = queue;
    int i = index;
    return (i >= 0 && i < q.size()) ? q.get(i) : null;
  }
  public List<Track> queueCopy() { return new ArrayList<>(queue); }
  public void run(Runnable r) { handler.post(r); }

  @Override public IBinder onBind(Intent intent) { return null; }

  @Override public void onCreate() {
    super.onCreate();
    instance = this;
    audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationManager nmgr = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      try { nmgr.deleteNotificationChannel("filevault_music"); } catch (Exception ignored) { }
      NotificationChannel ch = new NotificationChannel(CHANNEL, "Music controls", NotificationManager.IMPORTANCE_DEFAULT);
      ch.setShowBadge(false);
      ch.setSound(null, null);
      ch.enableVibration(false);
      ch.enableLights(false);
      ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
      nmgr.createNotificationChannel(ch);
    }
    session = new MediaSession(this, "FileVault");
    session.setFlags(MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS | MediaSession.FLAG_HANDLES_MEDIA_BUTTONS);
    session.setCallback(new MediaSession.Callback() {
      @Override public void onPlay() { playNow(); }
      @Override public void onPause() { pauseNow(); }
      @Override public void onSkipToNext() { nextNow(false); }
      @Override public void onSkipToPrevious() { prevNow(); }
      @Override public void onSeekTo(long pos) { seekNow((int) pos); }
      @Override public void onStop() { stopAll(); }
    });
    Intent launch0 = getPackageManager().getLaunchIntentForPackage(getPackageName());
    if (launch0 != null) session.setSessionActivity(PendingIntent.getActivity(this, 1, launch0, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)));
    session.setActive(true);
    noisy = new BroadcastReceiver() {
      @Override public void onReceive(Context context, Intent intent) { pauseNow(); }
    };
    registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
    handler.post(ticker);
  }

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    ensureForeground();
    String a = intent == null ? null : intent.getAction();
    if (A_LOAD.equals(a)) {
      List<Track> p = pending;
      pending = null;
      if (p != null && !p.isEmpty()) load(p, pendingIndex, pendingPlay, pendingShuffle, pendingRepeat);
    } else if (A_TOGGLE.equals(a)) { if (isPlaying()) pauseNow(); else playNow(); }
    else if (A_NEXT.equals(a)) nextNow(false);
    else if (A_PREV.equals(a)) prevNow();
    else if (A_STOP.equals(a)) stopAll();
    return START_NOT_STICKY;
  }

  @Override public void onDestroy() {
    handler.removeCallbacksAndMessages(null);
    releasePlayer();
    try { unregisterReceiver(noisy); } catch (Exception ignored) { }
    try { session.setActive(false); session.release(); } catch (Exception ignored) { }
    instance = null;
    super.onDestroy();
  }

  /* ---------- playback (always runs on the main thread) ---------- */
  void load(List<Track> q, int i, boolean play, boolean sh, String rep) {
    queue.clear();
    queue.addAll(q);
    shuffle = sh;
    repeat = rep == null ? "off" : rep;
    index = Math.max(0, Math.min(i, queue.size() - 1));
    startTrack(play);
  }

  private void startTrack(boolean play) {
    releasePlayer();
    if (index < 0 || index >= queue.size()) return;
    wantPlay = play;
    prepared = false;
    Track t = queue.get(index);
    try {
      player = new MediaPlayer();
      player.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
      player.setAudioAttributes(new AudioAttributes.Builder()
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .setUsage(AudioAttributes.USAGE_MEDIA).build());
      player.setDataSource(t.path);
      player.setOnPreparedListener(mp -> {
        prepared = true;
        applyEq();
        if (wantPlay) { requestFocus(); mp.start(); }
        updateAll("track");
      });
      player.setOnCompletionListener(mp -> onComplete());
      player.setOnErrorListener((mp, what, extra) -> {
        prepared = false;
        wantPlay = false;
        updateAll("error");
        notifyState("error");
        return true;
      });
      player.prepareAsync();
    } catch (Exception e) {
      prepared = false;
      wantPlay = false;
      notifyState("error");
    }
    updateAll("track");
  }

  private boolean isPlaying() {
    try { return player != null && prepared && player.isPlaying(); } catch (Exception e) { return false; }
  }

  void playNow() {
    if (player == null) return;
    wantPlay = true;
    requestFocus();
    if (prepared) { try { player.start(); } catch (Exception ignored) { } }
    updateAll("state");
  }

  void pauseNow() {
    wantPlay = false;
    if (prepared) { try { if (player.isPlaying()) player.pause(); } catch (Exception ignored) { } }
    updateAll("state");
  }

  void nextNow(boolean auto) {
    int n = queue.size();
    if (n == 0) return;
    if (auto && "one".equals(repeat)) { seekNow(0); playNow(); return; }
    int j;
    if (shuffle && n > 1) {
      do { j = random.nextInt(n); } while (j == index);
    } else {
      j = index + 1;
      if (j >= n) {
        if ("all".equals(repeat) || !auto) {
          j = 0;
        } else {
          wantPlay = false;
          if (prepared) { try { player.pause(); player.seekTo(0); } catch (Exception ignored) { } }
          updateAll("state");
          return;
        }
      }
    }
    index = j;
    startTrack(true);
  }

  void prevNow() {
    int n = queue.size();
    if (n == 0) return;
    if (prepared && posMs > 3000) { seekNow(0); return; }
    index = (index - 1 + n) % n;
    startTrack(true);
  }

  void seekNow(int ms) {
    if (prepared) { try { player.seekTo(Math.max(0, ms)); } catch (Exception ignored) { } }
    updateAll("tick");
  }

  void setMode(Boolean sh, String rep) {
    if (sh != null) shuffle = sh;
    if (rep != null) repeat = rep;
    updateAll("state");
  }

  private void onComplete() { nextNow(true); }

  void stopAll() {
    releasePlayer();
    queue.clear();
    index = -1;
    wantPlay = false;
    playingNow = false;
    sleepAt = 0;
    posMs = 0;
    durMs = 0;
    try { audio.abandonAudioFocus(focusListener); } catch (Exception ignored) { }
    try { stopForeground(true); } catch (Exception ignored) { }
    foreground = false;
    notifyState("stopped");
    stopSelf();
  }

  /** (Re)attach the equalizer to the current player using the saved settings. */
  void applyEq() {
    releaseEq();
    if (player == null) return;
    try {
      eq = new android.media.audiofx.Equalizer(0, player.getAudioSessionId());
      short n = eq.getNumberOfBands();
      short[] range = eq.getBandLevelRange();
      int[] lv = eqLevelsS;
      if (lv != null) {
        for (short b = 0; b < n && b < lv.length; b++) {
          eq.setBandLevel(b, (short) Math.max(range[0], Math.min(range[1], lv[b])));
        }
      }
      eq.setEnabled(eqEnabledS);
    } catch (Exception e) { eq = null; }
  }

  private void releaseEq() {
    if (eq != null) { try { eq.release(); } catch (Exception ignored) { } eq = null; }
  }

  private void releasePlayer() {
    releaseEq();
    if (player != null) {
      try { player.setOnPreparedListener(null); player.setOnCompletionListener(null); player.setOnErrorListener(null); player.release(); } catch (Exception ignored) { }
      player = null;
    }
    prepared = false;
  }

  private void requestFocus() {
    try { audio.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN); } catch (Exception ignored) { }
  }

  /* ---------- session, notification, events ---------- */
  private void snapshot() {
    playingNow = isPlaying();
    if (prepared && player != null) {
      try { posMs = player.getCurrentPosition(); durMs = player.getDuration(); } catch (Exception ignored) { }
    } else { posMs = 0; durMs = 0; }
  }

  private void updateAll(String kind) {
    snapshot();
    updateSession();
    if (wantPlay) ensureForeground();
    else if (foreground) { try { stopForeground(false); } catch (Exception ignored) { } foreground = false; }
    updateNotification();
    notifyState(kind);
  }

  private void updateSession() {
    try {
      Track t = currentTrack();
      MediaMetadata.Builder mb = new MediaMetadata.Builder();
      if (t != null) {
        mb.putString(MediaMetadata.METADATA_KEY_TITLE, t.title); mb.putString(MediaMetadata.METADATA_KEY_ARTIST, t.artist);
        mb.putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, t.title); mb.putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, t.artist);
        mb.putString(MediaMetadata.METADATA_KEY_ALBUM, t.artist);
      }
      mb.putLong(MediaMetadata.METADATA_KEY_DURATION, durMs);
      session.setMetadata(mb.build());
      // Keep the platform session active while a queue exists, including while paused.
      // Android 13+ derives the lock-screen / Quick Settings media card from this session.
      session.setActive(!queue.isEmpty());
      int st = playingNow ? PlaybackState.STATE_PLAYING : (wantPlay && !prepared ? PlaybackState.STATE_BUFFERING : PlaybackState.STATE_PAUSED);
      long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
          | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_STOP;
      session.setPlaybackState(new PlaybackState.Builder().setActions(actions).setState(st, posMs, playingNow ? 1f : 0f).build());
    } catch (Exception ignored) { }
  }

  private int smallIcon() {
    int id = getResources().getIdentifier("ic_stat_music", "drawable", getPackageName());
    return id != 0 ? id : android.R.drawable.ic_media_play;
  }

  private PendingIntent action(String a) {
    Intent i = new Intent(this, MusicService.class).setAction(a);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
    return PendingIntent.getService(this, a.hashCode(), i, flags);
  }

  private Notification buildNotification() {
    Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
    Track t = currentTrack();
    b.setSmallIcon(smallIcon())
        .setContentTitle(t != null ? t.title : "FileVault")
        .setContentText(t != null ? t.artist : "Music")
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setCategory(Notification.CATEGORY_TRANSPORT)
        .setOngoing(playingNow || wantPlay);
    if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
    Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
    if (launch != null) {
      int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
      b.setContentIntent(PendingIntent.getActivity(this, 0, launch, flags));
    }
    b.addAction(android.R.drawable.ic_media_previous, "Previous", action(A_PREV));
    b.addAction(playingNow ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playingNow ? "Pause" : "Play", action(A_TOGGLE));
    b.addAction(android.R.drawable.ic_media_next, "Next", action(A_NEXT));
    b.setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
    return b.build();
  }

  private void ensureForeground() {
    try {
      Notification n = buildNotification();
      if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
      else startForeground(NOTIF_ID, n);
      foreground = true;
    } catch (Exception e) { lastError = "foreground: " + e; }
  }

  private void updateNotification() {
    try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(NOTIF_ID, buildNotification()); } catch (Exception e) { lastError = "notify: " + e; }
  }

  private void notifyState(String kind) {
    Listener l = listener;
    if (l != null) l.onState(kind);
  }
}
