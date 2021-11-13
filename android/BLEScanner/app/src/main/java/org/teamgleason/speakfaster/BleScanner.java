package org.teamgleason.speakfaster;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.os.Handler;
import android.util.Log;

import com.google.common.collect.ImmutableList;

public class BleScanner {

    public interface BleScanCallbacks {
        void onBeaconDetected(String address, float rssi, float estimatedDistanceM);
    }

    private static final String TAG = "BleScanner";
    private static final float IGNORE_DISTANCE_THRESHOLD_M = 5.0f;

    private final BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
    private BluetoothLeScanner scanner = null;
    private Handler handler = new Handler();
    private final BleScanCallbacks callbacks;

    public BleScanner (BleScanCallbacks callbacks) {
        this.callbacks = callbacks;
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
                        callbacks.onBeaconDetected(address, rssi, distance);
                    }
                }

                @Override
                public void onScanFailed(int errorCode) {
                    super.onScanFailed(errorCode);
                    Log.i(TAG, "BLE scan failed: code = " + errorCode);
                }
            };

    public void startScan() {
        if (!adapter.isEnabled()) {
            // TODO(cais): Display error message.
        }
        if (scanner == null) {
            scanner = adapter.getBluetoothLeScanner();
        }
        ScanFilter scanFilter = new ScanFilter.Builder()
                // NOTE: 0x004c manufacturer filters for iBeacon devices.
                .setManufacturerData(0x004c, new byte[] {})
                .build();
        ScanSettings scanSettings = new ScanSettings.Builder().build();
        scanner.startScan(ImmutableList.of(scanFilter), scanSettings, bleScanCallback);
    }

    public void stopScan() {
        if (scanner != null) {
            scanner.stopScan(bleScanCallback);
        }
    }

    /**
     * Translates RSSI (Received signal strength indicator in dBm) to estimated distance.
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
