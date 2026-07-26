package com.studentconnect.app;

import android.Manifest;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // ১. ওএস লেভেলে সরাসরি ক্যামেরা ও মাইকের পারমিশন পপ-আপ চাওয়া
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            requestPermissions(new String[]{
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.MODIFY_AUDIO_SETTINGS
            }, 101);
        }

        // ২. ক্যাপাসিটর ব্রিজ লোড হওয়ার পর WebView-এর কড়া সিকিউরিটি বাইপাস করা
        this.bridge.getWebView().post(new Runnable() {
            @Override
            public void run() {
                bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
                bridge.getWebView().setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onPermissionRequest(final PermissionRequest request) {
                        MainActivity.this.runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                // ZegoCloud-এর জন্য ক্যামেরা, মাইক এবং অডিও রিসোর্স গ্র্যান্ট করা
                                request.grant(request.getResources());
                            }
                        });
                    }
                });
            }
        });
    }
}
