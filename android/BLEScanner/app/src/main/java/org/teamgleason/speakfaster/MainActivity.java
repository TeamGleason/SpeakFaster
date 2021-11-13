package org.teamgleason.speakfaster;

import android.Manifest.permission;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "MainActivity";

    private static final int PERMISSION_REQUEST_CODE = 2021;

//    private final BtStateChangeReceiver btStateChangeReceiver = new BtStateChangeReceiver();
    private Handler mainHandler = new Handler(Looper.getMainLooper());
    private TextView mainTextView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        mainTextView = findViewById(R.id.mainText);
        this.checkPermissionsAndStartScanning();
    }

    private void startBleScanInService() {
        Intent bleScanServiceIntent = new Intent(this, BleScanService.class);
        startService(bleScanServiceIntent);
    }

    private void checkPermissionsAndStartScanning() {
        boolean isBluetoothPermissionGranted =
                ContextCompat.checkSelfPermission(
                        this, permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (isBluetoothPermissionGranted) {
            startBleScanInService();
        } else {
            requestPermissions(new String[] {
                    permission.BLUETOOTH,
                    permission.BLUETOOTH_ADMIN,
                    permission.BLUETOOTH_SCAN,
                    permission.ACCESS_COARSE_LOCATION,
                    permission.ACCESS_FINE_LOCATION}, PERMISSION_REQUEST_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startBleScanInService();
            } else {
                Log.e(TAG, "Permission NOT granted!");
            }
        }
    }
}
