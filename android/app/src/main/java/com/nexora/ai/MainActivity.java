package com.nexora.ai;

import android.Manifest;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;

public class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(@Nullable Bundle state) {
        super.onCreate(state);
        ActivityCompat.requestPermissions(
            this,
            new String[] {
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO
            },
            40
        );

        webView = new WebView(this);
        setContentView(webView);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.setWebViewClient(new WebViewClient());

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(
                final PermissionRequest request
            ) {
                runOnUiThread(() ->
                    request.grant(request.getResources())
                );
            }
        });

        webView.evaluateJavascript(
            "window.NEXORA_API_BASE='https://red-dawn-ded1.workers.dev';",
            null
        );
        webView.loadUrl(
            "file:///android_asset/frontend/index.html"
        );
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
