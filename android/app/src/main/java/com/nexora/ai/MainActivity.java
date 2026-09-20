
package com.nexora.ai;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        requestRuntimePermissions();

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings =
            webView.getSettings();

        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        webView.setWebViewClient(
            new WebViewClient()
        );

        webView.setWebChromeClient(
            new WebChromeClient() {
                @Override
                public void onPermissionRequest(
                    final PermissionRequest request
                ) {
                    runOnUiThread(
                        () -> grantWebPermissions(
                            request
                        )
                    );
                }
            }
        );

        webView.loadUrl(
            "file:///android_asset/frontend/index.html"
        );
    }

    private void requestRuntimePermissions() {
        if (
            android.os.Build.VERSION.SDK_INT >= 23
        ) {
            requestPermissions(
                new String[] {
                    Manifest.permission.CAMERA,
                    Manifest.permission.RECORD_AUDIO
                },
                40
            );
        }
    }

    private void grantWebPermissions(
        PermissionRequest request
    ) {
        java.util.ArrayList<String> allowed =
            new java.util.ArrayList<>();

        for (
            String resource :
            request.getResources()
        ) {
            if (
                PermissionRequest
                    .RESOURCE_AUDIO_CAPTURE
                    .equals(resource) &&
                android.os.Build.VERSION.SDK_INT >= 23 &&
                checkSelfPermission(
                    Manifest.permission.RECORD_AUDIO
                ) == PackageManager.PERMISSION_GRANTED
            ) {
                allowed.add(resource);
            }

            if (
                PermissionRequest
                    .RESOURCE_VIDEO_CAPTURE
                    .equals(resource) &&
                android.os.Build.VERSION.SDK_INT >= 23 &&
                checkSelfPermission(
                    Manifest.permission.CAMERA
                ) == PackageManager.PERMISSION_GRANTED
            ) {
                allowed.add(resource);
            }
        }

        if (!allowed.isEmpty()) {
            request.grant(
                allowed.toArray(
                    new String[0]
                )
            );
        }
    }

    @Override
    public void onBackPressed() {
        if (
            webView != null &&
            webView.canGoBack()
        ) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }

        super.onDestroy();
    }
}
