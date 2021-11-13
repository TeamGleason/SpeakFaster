package org.teamgleason.speakfaster;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.app.PendingIntent;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.Intent;
import android.os.Binder;
import android.os.Handler;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import android.widget.Toast;


public class BleScanService extends Service implements BleScanner.BleScanCallbacks {
    private static final String TAG = "BleScanService";
    private static final int NOTIFICATION_ID = 1;
    private static final long SEND_BEACON_STATUS_DELAY_MILLIS = 5000;
    private final LocalBinder binder = new LocalBinder();
    private BleScanner bleScanner = new BleScanner(this);
    private PowerManager powerManager;
    private PowerManager.WakeLock wakeLock;
    private NotificationManager notificationManager;
    private Handler handler;

    private boolean isRunning = false;

    public class LocalBinder extends Binder {
        public BleScanService getService() {
            return BleScanService.this;
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        notificationManager = this.getSystemService(NotificationManager.class);
        acquirePartialWakeLock();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (wakeLock != null) {
            wakeLock.release();
            Log.i(TAG, "WakeLock released.");
        }
        if (bleScanner != null) {
            bleScanner.stopScan();
        }
    }

    private void acquirePartialWakeLock() {
        powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "SpeakFasterCompanion:PartialWakeLock");
        wakeLock.acquire();
        Log.i(TAG, "WakeLock acquired.");
    }

    private void sendBeaconStatus() {
        Log.i(TAG, "Sending beacon status");
        handler.postDelayed(() -> {
            sendBeaconStatus();
        }, SEND_BEACON_STATUS_DELAY_MILLIS);
    }

    private NotificationChannel createNotificationChannel() {
        int importance = NotificationManager.IMPORTANCE_DEFAULT;
        String notificationName = "SpeakFasterCompanion";  // TODO(cais): Do not hardcode.
        NotificationChannel channel =
                new NotificationChannel(notificationName, notificationName, importance);
        notificationManager.createNotificationChannel(channel);
        return channel;
    }

    private Notification createNotification() {
        Intent notificationIntent = new Intent(this, BleScanService.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent, 0);
        NotificationChannel channel = createNotificationChannel();
        String channelId = channel.getId();
        Log.i(TAG, "BleScanService: channelId = " + channelId);  // DEBUG
        return new Notification.Builder(this, channelId)
                .setContentTitle("SpeakFaster Companion")
                .setContentText("Scanning for BLE beacons")
                .setSmallIcon(R.drawable.ic_launcher_background)
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (isRunning) {
            return Service.START_STICKY;
        }

        super.onStartCommand(intent, flags, startId);
        Notification notification = createNotification();
        notificationManager.notify(NOTIFICATION_ID, notification);  // TODO(cais): Is this needed?
        startForeground(NOTIFICATION_ID, notification);

        handler = new Handler();
        Log.i(TAG, "service onStartCommand()"); // DEBUG
        handler.post(new Runnable() {
            @Override
            public void run() {
                Log.i(TAG, "service run()"); // DEBUG
                bleScanner.startScan();
                handler.postDelayed(() -> {
                    sendBeaconStatus();
                }, SEND_BEACON_STATUS_DELAY_MILLIS);
                isRunning = true;
            }
        });
        return Service.START_STICKY;
    }

    @Override
    public void onBeaconDetected(String address, float rssi, float estimatedDistanceM) {
        Log.i(TAG, String.format(
                "BleScanner address=%s, rssi=%.1f dBm, distance=%.3f m",
                address, rssi, estimatedDistanceM));
    }
}
