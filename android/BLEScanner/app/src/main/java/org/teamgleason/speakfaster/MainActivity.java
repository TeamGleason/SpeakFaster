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
import android.util.Log;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "BleScanner";

    private static final int PERMISSION_REQUEST_CODE = 2021;
    private static final float IGNORE_DISTANCE_THRESHOLD_M = 5.0f;
    private final BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
//    private final BtStateChangeReceiver btStateChangeReceiver = new BtStateChangeReceiver();
    private BluetoothLeScanner scanner = null;
    private Handler handler = new Handler();
    private Handler mainHandler = new Handler(Looper.getMainLooper());
    private TextView mainTextView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        mainTextView = findViewById(R.id.mainText);
//        IntentFilter filter = new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED);
//        this.getApplicationContext().registerReceiver(
//                btStateChangeReceiver, filter, /* broadcastPermission */ null, null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        this.checkPermissionsAndStartScanning();

        Intent bleScanServiceIntent = new Intent(this, BleScanService.class);
//        startService(bleScanServiceIntent);
        startForegroundService(bleScanServiceIntent);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (scanner != null) {
            scanner.stopScan(bleScanCallback);
            Log.i(TAG, "Stopped BLE scanning");
        }
    }

    private void checkPermissionsAndStartScanning() {
        boolean isBluetoothPermissionGranted =
                ContextCompat.checkSelfPermission(
                        this, permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (isBluetoothPermissionGranted) {
            scanForBleDevices();
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
                scanForBleDevices();
            } else {
                Log.e(TAG, "Permission NOT granted!");
            }
        }
    }

    private void scanForBleDevices() {
        if (!adapter.isEnabled()) {
            // TODO(cais): Display error message.
        }
        if (scanner == null) {
            scanner = adapter.getBluetoothLeScanner();
        }
        scanner.startScan(bleScanCallback);
    }

    private ScanCallback bleScanCallback =
            new ScanCallback() {
                @Override
                public void onScanResult(int callbackType, ScanResult result) {
                    super.onScanResult(callbackType, result);
                    String address = result.getDevice().getAddress();
                    // Received signal strength indicator (in dBm).
                    int rssi = result.getRssi();
                    float distance = rssi2Distance(rssi);
                    if (distance < IGNORE_DISTANCE_THRESHOLD_M) {
                        Log.i(TAG, String.format(
                            "BleScanner onScanResult: callbackType=%d, address=%s, rssi=%d dBm, distance=%.3f, details=%s",
                            callbackType, address, rssi, distance, result));
                        mainHandler.post(() -> {
                            String currentText = mainTextView.getText().toString();
                            if (currentText.indexOf(address) == -1) {
                                mainTextView.setText(
                                        currentText + String.format("\n%s - %.3fm", address, distance));
                            }
                        });
                    }
                }

                @Override
                public void onScanFailed(int errorCode) {
                    super.onScanFailed(errorCode);
                    Log.i(TAG, "BLE scan failed: code = " + errorCode);
//                    BluetoothAdapter.getDefaultAdapter().disable();
//                    scanner.stopScan(bleScanCallback);
//                    handler.postDelayed(() -> {
//                        scanner.startScan(bleScanCallback);
//                        Log.i(TAG, "Restarted BLE scanning after error code " + errorCode);
//                    }, 1000);
                }
            };

    class BtStateChangeReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            int state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.STATE_OFF);
            Log.d(TAG, "Bluetooth adapter state changed to: " + state);
            switch (state) {
                case BluetoothAdapter.STATE_ON:
                    Log.d(TAG, "Bluetooth adapter state changed to STATE_ON");
                    checkPermissionsAndStartScanning();
                    break;
                case BluetoothAdapter.STATE_OFF:
//                    handler.postDelayed(() -> {
//                        adapter.enable();
//                    }, 500);
                    Log.d(TAG, "Bluetooth adapter state changed to STATE_OFF");
                    break;
                default:
                    // Do nothing
            }
        }
    }

//    private NotificationChannel createNotificationChannel() {
//        NotificationManager notificationManager = this.getSystemService(NotificationManager.class);
//        int importance = NotificationManager.IMPORTANCE_LOW;
//        String notificationName = "SpeakFaster Companion";  // TODO(cais): Do not hardcode.
//        NotificationChannel channel =
//                new NotificationChannel(notificationName, notificationName, importance);
//        notificationManager.createNotificationChannel(channel);
//        return channel;
//    }
//
//    private Notification createNotification() {
//        Intent notificationIntent = new Intent(this, BleScanService.class);
//        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent, 0);
//        NotificationChannel channel = createNotificationChannel();
//        return new Notification.Builder(this, channel.getId())
//                .setContentTitle("SpeakFaster Companion")
//                .setContentText("Scanning for BLE beacons")
//                .setSmallIcon(R.drawable.ic_launcher_background)
//                .setContentIntent(pendingIntent)
//                .setOngoing(true)
//                .setChannelId("SpeakFaster")
//                .build();
//    }

    /**
     * Translate RSSI (Received signal strength indicator in dBm) to estimated distance.
     *
     * See: https://iotandelectronics.wordpress.com/2016/10/07/how-to-calculate-distance-from-the-rssi-value-of-the-ble-beacon/
     *
     * @return Estimated distance in meters.
     */
    private static float rssi2Distance(int rssi) {
        float n = 2.0f;
        float m = -65f;  // Hardcoded for BlueCharm iBeacon devices. May not work for others.
        return (float) Math.pow(10.0f, (m - rssi) / 10f / n);
    }
}
