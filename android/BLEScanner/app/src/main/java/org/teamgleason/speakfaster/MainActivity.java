package org.teamgleason.speakfaster;

import android.Manifest.permission;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "BleScanner";

    private static final int ACCESS_FINE_LOCATION_REQUEST_CODE = 2021;
    private final BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        this.checkPermissionsAndStartScanning();
    }

    private void checkPermissionsAndStartScanning() {
        boolean isBluetoothPermissionGranted =
                ContextCompat.checkSelfPermission(
                        this, permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (isBluetoothPermissionGranted) {
            scanForBleDevices();
        } else {
            requestPermissions(new String[] {permission.ACCESS_FINE_LOCATION}, ACCESS_FINE_LOCATION_REQUEST_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == ACCESS_FINE_LOCATION_REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                scanForBleDevices();
            } else {
                Log.e(TAG, "Permission NOT granted!");
            }
        }
    }

    private void scanForBleDevices() {
        BluetoothLeScanner scanner = adapter.getBluetoothLeScanner();
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
                    if (distance < 1.0) {
                        Log.i(TAG, String.format(
                            "BleScanner onScanResult: callbackType=%d, address=%s, rssi=%d dBm, distance=%.3f, details=%s",
                            callbackType, address, rssi, distance, result));
                    }
                }
            };

    /**
     * Translate RSSI (Received signal strength indicator in dBm) to estimated distance.
     *
     * See: https://iotandelectronics.wordpress.com/2016/10/07/how-to-calculate-distance-from-the-rssi-value-of-the-ble-beacon/
     *
     * @return Estimated distance in meters.
     */
    private static float rssi2Distance(int rssi) {
        float n = 2.0f;
        float m = -67f;  // Hardcoded for BlueCharm iBeacon devices. May not work for others.
        return (float) Math.pow(10.0f, (m - rssi) / 10f / n);
    }
}
