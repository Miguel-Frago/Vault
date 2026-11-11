package com.filevault.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.MimeTypeMap;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import android.util.Base64;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.media.MediaMetadataRetriever;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "FileVault")
public class FileVaultPlugin extends Plugin {
  private final ExecutorService scanner = Executors.newSingleThreadExecutor();
  @PluginMethod
  public void hasStorageAccess(PluginCall call) {
    JSObject ret = new JSObject();
    boolean allowed = Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager();
    ret.put("granted", allowed);
    call.resolve(ret);
  }

  @PluginMethod
  public void requestStorageAccess(PluginCall call) {
    if (Build.VERSION.SDK_INT >= 30 && !Environment.isExternalStorageManager()) {
      try {
        Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        getActivity().startActivity(intent);
      } catch (Exception e) {
        Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
        getActivity().startActivity(intent);
      }
    }
    JSObject ret = new JSObject();
    ret.put("openedSettings", true);
    call.resolve(ret);
  }

  @PluginMethod
  public void scanFiles(PluginCall call) {
    if (Build.VERSION.SDK_INT >= 30 && !Environment.isExternalStorageManager()) {
      call.reject("Please grant All files access in Android settings first.", "STORAGE_PERMISSION_REQUIRED");
      return;
    }
    scanner.execute(() -> {
      try {
        File root = Environment.getExternalStorageDirectory();
        JSArray results = new JSArray();
        int[] count = new int[]{0};
        walk(root, results, count);
        JSObject ret = new JSObject();
        ret.put("files", results);
        ret.put("count", count[0]);
        call.resolve(ret);
      } catch (Exception e) {
        call.reject("The phone storage scan could not be completed: " + e.getMessage());
      }
    });
  }

  private void walk(File dir, JSArray out, int[] count) {
    if (dir == null || !dir.exists() || !dir.isDirectory() || count[0] > 60000) return;
    String path = dir.getAbsolutePath();
    if (path.contains("/Android/data") || path.contains("/Android/obb") || dir.isHidden()) return;
    File[] children = dir.listFiles();
    if (children == null) return;
    for (File file : children) {
      try {
        if (file.isDirectory()) { walk(file, out, count); continue; }
        if (!file.isFile() || file.isHidden()) continue;
        String name = file.getName();
        String ext = extension(name);
        String type = classify(ext);
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        if (mime == null) mime = "application/octet-stream";
        JSObject item = new JSObject();
        item.put("id", file.getAbsolutePath());
        item.put("path", file.getAbsolutePath());
        item.put("name", name);
        item.put("extension", ext);
        item.put("type", type);
        item.put("mime", mime);
        item.put("size", file.length());
        item.put("modified", file.lastModified());
        item.put("parent", file.getParentFile() == null ? "" : file.getParentFile().getName());
        out.put(item);
        count[0]++;
      } catch (Exception ignored) { }
    }
  }

  private String extension(String name) {
    int dot = name.lastIndexOf('.');
    return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
  }

  private String classify(String ext) {
    switch (ext) {
      case "jpg": case "jpeg": case "png": case "gif": case "webp": case "bmp": case "heic": case "heif": case "avif":
        return "photos";
      case "mp4": case "mkv": case "mov": case "avi": case "webm": case "3gp": case "m4v": case "mpg": case "mpeg": case "ts": case "m2ts":
        return "videos";
      case "mp3": case "m4a": case "aac": case "wav": case "flac": case "ogg": case "opus": case "wma": case "mid": case "midi":
        return "music";
      case "log": case "xml": case "html": case "htm": case "tsv": case "yml": case "yaml": case "ini": case "js": case "css": case "py": case "java": case "kt": case "sh":
      case "pdf": case "txt": case "md": case "csv": case "json": case "doc": case "docx": case "xls": case "xlsx": case "ppt": case "pptx": case "rtf": case "odt": case "ods": case "odp":
        return "documents";
      case "apk": return "apps";
      default: return "other";
    }
  }

  @PluginMethod
  public void shareFiles(PluginCall call) {
    JSArray paths = call.getArray("paths");
    if (paths == null || paths.length() == 0) { call.reject("Select at least one file to share."); return; }
    try {
      ArrayList<Uri> uris = new ArrayList<>();
      for (int i = 0; i < paths.length(); i++) {
        String path = paths.getString(i);
        File file = new File(path);
        if (!file.exists() || !file.isFile()) continue;
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        uris.add(uri);
      }
      if (uris.isEmpty()) { call.reject("The selected files are no longer available."); return; }
      Intent send;
      if (uris.size() == 1) {
        send = new Intent(Intent.ACTION_SEND);
        send.setType(mimeFor(new File(paths.getString(0))));
        send.putExtra(Intent.EXTRA_STREAM, uris.get(0));
        send.setClipData(android.content.ClipData.newUri(getContext().getContentResolver(), "FileVault file", uris.get(0)));
      } else {
        send = new Intent(Intent.ACTION_SEND_MULTIPLE);
        send.setType("*/*");
        send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
        android.content.ClipData clip = android.content.ClipData.newUri(getContext().getContentResolver(), "FileVault files", uris.get(0));
        for (int i = 1; i < uris.size(); i++) clip.addItem(new android.content.ClipData.Item(uris.get(i)));
        send.setClipData(clip);
      }
      send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      getActivity().startActivity(Intent.createChooser(send, "Share with"));
      JSObject ret = new JSObject(); ret.put("opened", true); ret.put("count", uris.size()); call.resolve(ret);
    } catch (Exception e) { call.reject("Unable to share these files: " + e.getMessage()); }
  }

  private String mimeFor(File file) {
    String ext = extension(file.getName());
    String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
    return mime == null ? "application/octet-stream" : mime;
  }

  @PluginMethod
  public void readFile(PluginCall call) {
    String path = call.getString("path");
    if (path == null) { call.reject("Missing file path."); return; }
    try {
      File file = new File(path);
      if (!file.exists() || !file.isFile()) { call.reject("File not found."); return; }
      long limit = 40L * 1024L * 1024L;
      if (file.length() > limit) { call.reject("This file is too large for the built-in preview. Use Open with instead."); return; }
      byte[] bytes = Files.readAllBytes(file.toPath());
      JSObject ret = new JSObject();
      ret.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
      String ext = extension(file.getName());
      if (java.util.Arrays.asList("txt", "md", "csv", "tsv", "json", "log", "xml", "html", "htm", "js", "css", "py", "java", "kt", "sh", "yml", "yaml", "ini", "srt", "vtt", "lrc").contains(ext)) {
        ret.put("text", new String(bytes, StandardCharsets.UTF_8));
      }
      call.resolve(ret);
    } catch (Exception e) { call.reject("Unable to preview this file: " + e.getMessage()); }
  }


  @PluginMethod
  public void videoThumbnail(PluginCall call) {
    String path = call.getString("path");
    if (path == null) { call.reject("Missing video path."); return; }
    MediaMetadataRetriever retriever = new MediaMetadataRetriever();
    try {
      File file = new File(path);
      if (!file.exists() || !file.isFile()) { call.reject("Video file not found."); return; }
      retriever.setDataSource(path);
      Bitmap bitmap = retriever.getFrameAtTime(1_000_000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
      if (bitmap == null) bitmap = retriever.getFrameAtTime();
      if (bitmap == null) { call.reject("A video thumbnail is not available."); return; }
      ByteArrayOutputStream output = new ByteArrayOutputStream();
      bitmap.compress(Bitmap.CompressFormat.JPEG, 78, output);
      JSObject result = new JSObject();
      result.put("base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
      call.resolve(result);
      output.close(); bitmap.recycle();
    } catch (Exception e) { call.reject("Unable to create video thumbnail: " + e.getMessage()); }
    finally { try { retriever.release(); } catch (Exception ignored) { } }
  }

  @PluginMethod
  public void imageThumbnail(PluginCall call) {
    String path = call.getString("path");
    int size = call.getInt("size", 320);
    if (path == null) { call.reject("Missing image path."); return; }
    try {
      File file = new File(path);
      if (!file.exists() || !file.isFile()) { call.reject("Image file not found."); return; }
      BitmapFactory.Options bounds = new BitmapFactory.Options();
      bounds.inJustDecodeBounds = true;
      BitmapFactory.decodeFile(path, bounds);
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) { call.reject("Unsupported image."); return; }
      int sample = 1;
      while (bounds.outWidth / (sample * 2) >= size && bounds.outHeight / (sample * 2) >= size) sample *= 2;
      BitmapFactory.Options opts = new BitmapFactory.Options();
      opts.inSampleSize = sample;
      Bitmap bitmap = BitmapFactory.decodeFile(path, opts);
      if (bitmap == null) { call.reject("Unsupported image."); return; }
      int rotation = 0;
      try {
        int o = new ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
        if (o == ExifInterface.ORIENTATION_ROTATE_90) rotation = 90;
        else if (o == ExifInterface.ORIENTATION_ROTATE_180) rotation = 180;
        else if (o == ExifInterface.ORIENTATION_ROTATE_270) rotation = 270;
      } catch (Exception ignored) { }
      if (rotation != 0) {
        Matrix m = new Matrix();
        m.postRotate(rotation);
        Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), m, true);
        if (rotated != bitmap) { bitmap.recycle(); bitmap = rotated; }
      }
      ByteArrayOutputStream output = new ByteArrayOutputStream();
      bitmap.compress(Bitmap.CompressFormat.JPEG, 78, output);
      JSObject result = new JSObject();
      result.put("base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
      call.resolve(result);
      output.close(); bitmap.recycle();
    } catch (Throwable e) { call.reject("Unable to create image thumbnail: " + e.getMessage()); }
  }

  @PluginMethod
  public void previewPdf(PluginCall call) {
    String path = call.getString("path");
    if (path == null) { call.reject("Missing PDF path."); return; }
    try {
      File file = new File(path);
      if (!file.exists() || !file.isFile() || !path.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
        call.reject("PDF file not found."); return;
      }
      ParcelFileDescriptor descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
      PdfRenderer renderer = new PdfRenderer(descriptor);
      JSArray pages = new JSArray();
      int totalPages = renderer.getPageCount();
      int startPage = Math.max(0, call.getInt("start", 0));
      int pageCount = Math.min(totalPages, startPage + Math.max(1, call.getInt("count", 6)));
      for (int i = startPage; i < pageCount; i++) {
        PdfRenderer.Page page = renderer.openPage(i);
        int width = Math.min(1200, page.getWidth() * 2);
        int height = Math.max(1, (int) (width * (page.getHeight() / (float) page.getWidth())));
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        bitmap.eraseColor(android.graphics.Color.WHITE);
        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.PNG, 90, output);
        pages.put(Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
        output.close(); bitmap.recycle(); page.close();
      }
      renderer.close(); descriptor.close();
      JSObject result = new JSObject(); result.put("pages", pages); result.put("totalPages", totalPages); call.resolve(result);
    } catch (Exception e) { call.reject("Unable to preview this PDF: " + e.getMessage()); }
  }

  @PluginMethod
  public void openFile(PluginCall call) {
    String path = call.getString("path");
    if (path == null) { call.reject("Missing file path."); return; }
    try {
      File file = new File(path);
      if (!file.exists()) { call.reject("File not found."); return; }
      Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
      Intent intent = new Intent(Intent.ACTION_VIEW);
      intent.setDataAndType(uri, mimeFor(file));
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
      getActivity().startActivity(Intent.createChooser(intent, "Open with"));
      call.resolve();
    } catch (Exception e) { call.reject("No compatible app could open this file: " + e.getMessage()); }
  }

  @PluginMethod
  public void appIcon(PluginCall call) {
    String pkg = call.getString("packageName");
    if (pkg == null) { call.reject("Missing package name."); return; }
    try {
      android.graphics.drawable.Drawable d = getContext().getPackageManager().getApplicationIcon(pkg);
      int size = 96;
      Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
      android.graphics.Canvas canvas = new android.graphics.Canvas(bitmap);
      d.setBounds(0, 0, size, size);
      d.draw(canvas);
      ByteArrayOutputStream output = new ByteArrayOutputStream();
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, output);
      JSObject result = new JSObject();
      result.put("base64", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
      call.resolve(result);
      output.close(); bitmap.recycle();
    } catch (Throwable e) { call.reject("Unable to read the app icon: " + e.getMessage()); }
  }

  @PluginMethod
  public void listApps(PluginCall call) {
    JSArray apps = new JSArray();
    try {
      Intent query = new Intent(Intent.ACTION_MAIN, null);
      query.addCategory(Intent.CATEGORY_LAUNCHER);
      List<android.content.pm.ResolveInfo> list = getContext().getPackageManager().queryIntentActivities(query, 0);
      for (android.content.pm.ResolveInfo info : list) {
        JSObject item = new JSObject();
        item.put("name", info.loadLabel(getContext().getPackageManager()).toString());
        item.put("packageName", info.activityInfo.packageName);
        apps.put(item);
      }
    } catch (Exception ignored) { }
    JSObject ret = new JSObject(); ret.put("apps", apps); call.resolve(ret);
  }

  @PluginMethod
  public void launchApp(PluginCall call) {
    String pkg = call.getString("packageName");
    try {
      Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(pkg);
      if (intent == null) { call.reject("This app cannot be launched."); return; }
      getActivity().startActivity(intent); call.resolve();
    } catch (Exception e) { call.reject("Unable to launch app: " + e.getMessage()); }
  }

  /** Total and free space of the phone's main storage. */
  @PluginMethod
  public void storageInfo(PluginCall call) {
    try {
      android.os.StatFs st = new android.os.StatFs(Environment.getExternalStorageDirectory().getPath());
      JSObject o = new JSObject();
      o.put("total", st.getTotalBytes());
      o.put("free", st.getAvailableBytes());
      call.resolve(o);
    } catch (Exception e) { call.reject("Could not read storage size: " + e.getMessage()); }
  }
}
