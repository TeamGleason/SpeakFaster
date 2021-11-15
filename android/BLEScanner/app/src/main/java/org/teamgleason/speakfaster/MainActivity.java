package org.teamgleason.speakfaster;

import android.Manifest.permission;
import android.app.AlertDialog;
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
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AutoCompleteTextView;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.core.content.ContextCompat;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "MainActivity";

    public static final String BROADCAST_OBSERVER_ADDRESS_INTENT_NAME =
            "SPEAKFASTER_BROADCAST_OBSERVER_ADDRESS";
    private static final int PERMISSION_REQUEST_CODE = 2021;
    private static final String DEFAULT_OBSERVER_IP_ADDRESS = "192.168.1.3";
    private static final int DEFAULT_OBSERVER_PORT = 53737;

    private Handler mainHandler = new Handler(Looper.getMainLooper());
    private TextView mainTextView;
    private String observerIpAddress = DEFAULT_OBSERVER_IP_ADDRESS;
    private int observerPort = DEFAULT_OBSERVER_PORT;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        mainTextView = findViewById(R.id.mainText);
        LocalBroadcastManager.getInstance(this).registerReceiver(
                broadcastReceiver, new IntentFilter(BleScanService.BROADCAST_STATUS_INTENT_NAME));
        this.checkPermissionsAndStartScanning();
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        getMenuInflater().inflate(R.menu.main_options_menu, menu);
        return super.onCreateOptionsMenu(menu);
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        switch (item.getItemId()) {
            case R.id.set_observer_address:
                AlertDialog.Builder dialogBuilder = new AlertDialog.Builder(this);
                dialogBuilder.setTitle("Set Observer address\n(e.g., 192.168.1.3:53737)");
                View inflated = LayoutInflater.from(this).inflate(
                        R.layout.server_address_dialog, findViewById(R.id.content), false);
                dialogBuilder.setView(inflated);
                AutoCompleteTextView textView = inflated.findViewById(R.id.observer_address_input);
                textView.setText(observerIpAddress + ":" + observerPort);
                Context activity = this;
                dialogBuilder.setPositiveButton(android.R.string.ok, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        String newAddress = textView.getText().toString();
                        // TODO(cais): Check for error.
                        observerIpAddress = newAddress.split(":")[0];
                        observerPort = Integer.parseInt(newAddress.split(":")[1]);
                        Intent intent = new Intent(BROADCAST_OBSERVER_ADDRESS_INTENT_NAME);
                        intent.putExtra("ip_address", observerIpAddress);
                        intent.putExtra("port", observerPort);
                        LocalBroadcastManager.getInstance(activity).sendBroadcast(intent);
                        dialog.dismiss();
                    }
                });
                dialogBuilder.show();
                return true;
            default:
                return super.onOptionsItemSelected(item);
        }
    }

    public BroadcastReceiver broadcastReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String statusJsonString = intent.getStringExtra("status");  // TODO(cais): DO NOT HARDCODE.
            JsonObject statusObject = new JsonParser().parse(statusJsonString).getAsJsonObject();
            Log.i(TAG, "Received broadcast status:" + statusObject.toString());
        }
    };

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
