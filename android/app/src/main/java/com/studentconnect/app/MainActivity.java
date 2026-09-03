package com.studentconnect.app;

import android.Manifest;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.view.View;
import android.widget.FrameLayout;
import android.content.pm.ActivityInfo;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private FrameLayout fullscreenContainer;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // ১. ওএস লেভেলে সরাসরি ক্যামেরা ও মাইকের পারমিশন পপ-আপ চাওয়া
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            requestPermissions(new String[]{
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.MODIFY_AUDIO_SETTINGS
            }, 101);
        }

        // ২. ক্যাপাসিটর ব্রিজ লোড হওয়ার পর WebView-এর কড়া সিকিউরিটি বাইপাস করা
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
                    
                    // 🔥 Fullscreen support
                    @Override
                    public void onShowCustomView(View view, CustomViewCallback callback) {
                        if (customView != null) {
                            callback.onCustomViewHidden();
                            return;
                        }
                        customView = view;
                        customViewCallback = callback;
                        
                        fullscreenContainer = new FrameLayout(MainActivity.this);
                        fullscreenContainer.setBackgroundColor(android.graphics.Color.BLACK);
                        fullscreenContainer.addView(view);
                        
                        ((FrameLayout) getWindow().getDecorView()).addView(fullscreenContainer, 
                            new FrameLayout.LayoutParams(
                                FrameLayout.LayoutParams.MATCH_PARENT, 
                                FrameLayout.LayoutParams.MATCH_PARENT
                            ));
                        
                        // 🔥 Fullscreen-এ auto-rotate allow — video landscape/portrait যেকোনোভাবে ফিট হবে
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
                    }

                    @Override
                    public void onHideCustomView() {
                        if (customView == null) return;
                        
                        ((FrameLayout) getWindow().getDecorView()).removeView(fullscreenContainer);
                        customView = null;
                        fullscreenContainer = null;
                        if (customViewCallback != null) {
                            customViewCallback.onCustomViewHidden();
                        }
                        
                        // 🔥 Fullscreen বন্ধ হলে app portrait-এ ফিরে আসবে
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                    }
                });
            }
        });
    }
}
