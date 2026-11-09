# R8 keep rules for rdr.
#
# Capacitor resolves plugin classes and @PluginMethod handlers by reflection, and
# the WebView calls @JavascriptInterface methods by name. Renaming any of them
# breaks the native bridge at runtime, so they stay.

-keep class app.rdr.MainActivity { *; }

-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public <methods>;
    @android.webkit.JavascriptInterface <methods>;
}

# Cordova-era plugins (none today) must keep the same shape if added later.
-keep class * extends org.apache.cordova.CordovaPlugin { *; }

# Keep annotations the bridge reads at runtime.
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,AnnotationDefault
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
