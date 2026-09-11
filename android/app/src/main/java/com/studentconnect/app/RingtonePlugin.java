// File Name: frontend/android/app/src/main/java/com/studentconnect/app/RingtonePlugin.java

package com.studentconnect.app;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RingtoneControl")
public class RingtonePlugin extends Plugin {
    private static final String TAG = "RingtonePlugin";

    @PluginMethod
    public void stopRingtone(PluginCall call) {
        try {
            Log.d(TAG, "stopRingtone called from JS");
            MyFirebaseMessagingService.stopRingtoneFromOutside(getContext());
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error: " + e.getMessage());
            call.reject("Failed: " + e.getMessage());
        }
    }
}
