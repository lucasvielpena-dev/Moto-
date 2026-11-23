package com.rota.entregadores;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {

    private String pendingFileContent;

    private final ActivityResultLauncher<Intent> saveDocumentLauncher =
        registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                Uri uri = result.getData().getData();
                if (uri != null && pendingFileContent != null) {
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        if (os != null) {
                            os.write(pendingFileContent.getBytes(StandardCharsets.UTF_8));
                        }
                    } catch (IOException ignored) {
                    }
                }
            }
            pendingFileContent = null;
        });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new RotaAndroidBridge(), "RotaAndroid");
        }
    }

    private class RotaAndroidBridge {

        @JavascriptInterface
        public void saveFile(String filename, String mimeType, String content) {
            runOnUiThread(() -> {
                pendingFileContent = content;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mimeType != null && !mimeType.isEmpty() ? mimeType : "*/*");
                intent.putExtra(Intent.EXTRA_TITLE, filename);
                saveDocumentLauncher.launch(intent);
            });
        }

        @JavascriptInterface
        public void shareText(String text) {
            runOnUiThread(() -> {
                Intent sendIntent = new Intent(Intent.ACTION_SEND);
                sendIntent.setType("text/plain");
                sendIntent.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(sendIntent, "Compartilhar resumo"));
            });
        }

        @JavascriptInterface
        public void shareFile(String filename, String mimeType, String content) {
            runOnUiThread(() -> {
                try {
                    File shareDir = new File(getCacheDir(), "share");
                    if (!shareDir.exists()) {
                        //noinspection ResultOfMethodCallIgnored
                        shareDir.mkdirs();
                    }
                    File outFile = new File(shareDir, filename);
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        fos.write(content.getBytes(StandardCharsets.UTF_8));
                    }
                    Uri uri = FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".fileprovider",
                        outFile
                    );
                    Intent sendIntent = new Intent(Intent.ACTION_SEND);
                    sendIntent.setType(mimeType != null && !mimeType.isEmpty() ? mimeType : "application/json");
                    sendIntent.putExtra(Intent.EXTRA_STREAM, uri);
                    sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(sendIntent, "Compartilhar backup"));
                } catch (IOException ignored) {
                }
            });
        }

        @JavascriptInterface
        public void printPage() {
            runOnUiThread(() -> {
                WebView webView = bridge != null ? bridge.getWebView() : null;
                if (webView == null) return;
                PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (printManager != null) {
                    String jobName = "Rota - Relatório mensal";
                    PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
                    printManager.print(jobName, adapter, new PrintAttributes.Builder().build());
                }
            });
        }
    }
}
