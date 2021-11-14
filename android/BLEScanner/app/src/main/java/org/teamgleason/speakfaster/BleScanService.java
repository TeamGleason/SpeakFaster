package org.teamgleason.speakfaster;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Binder;
import android.os.Handler;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.ProtocolException;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BleScanService extends Service implements BleScanner.BleScanCallbacks {
    private static final String TAG = "BleScanService";
    private static final int NOTIFICATION_ID = 1;
    private static final String NOTIFICATION_TITLE = "SpeakFaster Observer Companion";
    private static final long SEND_BEACON_STATUS_PERIOD_MILLIS = 5000;

    public static final String BROADCAST_STATUS_INTENT_NAME = "SPEAKFASTER_BROADCAST_STATUS";

    private final LocalBinder binder = new LocalBinder();
    private BleScanner bleScanner = new BleScanner(this);
    private PowerManager powerManager;
    private PowerManager.WakeLock wakeLock;
    private NotificationManager notificationManager;
    private NotificationChannel notificationChannel;
    private Handler handler;
    private ExecutorService executorService = Executors.newSingleThreadExecutor();
    private NsdManager nsdManager;
    // Addresses of the beacon that are detected in the current
    private final List<String> activeBeaconAddresses = new ArrayList<>();

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
        nsdManager = (NsdManager) getSystemService(Context.NSD_SERVICE);
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
        sendBeaconStatusViaBroadcast();
        sendBeaconStatusViaHttp();
        notificationManager.notify(NOTIFICATION_ID, createStatusNotification());
        activeBeaconAddresses.clear();
        handler.postDelayed(() -> {
            sendBeaconStatus();
        }, SEND_BEACON_STATUS_PERIOD_MILLIS);
    }

    private String makeStatusJsonString() {
        JsonArray deviceAddresses = new JsonArray();
        for (int i = 0; i < activeBeaconAddresses.size(); ++i) {
            deviceAddresses.add(activeBeaconAddresses.get(i));
        }
        JsonObject object = new JsonObject();
        object.add("deviceAddresses", deviceAddresses);
        return object.toString();
    }

    private void sendBeaconStatusViaBroadcast() {
        Intent intent = new Intent(BROADCAST_STATUS_INTENT_NAME);
        intent.putExtra("status", makeStatusJsonString());
        LocalBroadcastManager.getInstance(this).sendBroadcast(intent);
    }

    private void sendBeaconStatusViaHttp() {
        executorService.submit(() -> {
            try {
                // TODO(cais): DO NOT HARDCODE IP address and port number. Use NSD.
                URL url = new URL("http://192.168.1.3:53737/");
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                connection.setRequestMethod("GET");
                connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                Log.i(TAG, "http 500");
                int responseCode = connection.getResponseCode();
                String responseMessage = connection.getResponseMessage();
                Log.i(TAG, "http 1000: response code = " + responseCode
                        + ": " + responseMessage);
            } catch (MalformedURLException e) {
                // TODO(cais): Show notification.
                Log.e(TAG, "MalformedURLException: " + e.getMessage());
            } catch (ProtocolException e) {
                // TODO(cais): Show notification.
                Log.e(TAG, "ProtocolException: " + e.getMessage());
            } catch (IOException e) {
                // TODO(cais): Show notification.
                Log.e(TAG, "IOException: " + e.getMessage());
            }
        });
    }

    private NotificationChannel createNotificationChannel() {
        int importance = NotificationManager.IMPORTANCE_LOW;
        String notificationName = "SpeakFasterCompanion";  // TODO(cais): Do not hardcode.
        NotificationChannel channel =
                new NotificationChannel(notificationName, notificationName, importance);
        notificationManager.createNotificationChannel(channel);
        return channel;
    }

    private Notification createInitialNotification() {
        if (notificationChannel == null) {
            notificationChannel = createNotificationChannel();
        }
        return new Notification.Builder(this, notificationChannel.getId())
                .setContentTitle(NOTIFICATION_TITLE)
                .setContentText("Scanning for BLE beacons")
                .setSmallIcon(R.drawable.ic_launcher_background)
                .build();
    }

    private Notification createStatusNotification() {
        if (notificationChannel == null) {
            notificationChannel = createNotificationChannel();
        }
        String status = String.format("%d BLE beacons(s):", activeBeaconAddresses.size());
        int numAddressesToShow = Math.min(activeBeaconAddresses.size(), 3);
        for (int i = 0; i < numAddressesToShow; ++i) {
            status += "\n" + activeBeaconAddresses.get(i);
        }
        return new Notification.Builder(this, notificationChannel.getId())
                .setContentTitle(NOTIFICATION_TITLE)
                .setContentText(status)
                .setSmallIcon(R.drawable.ic_launcher_background)
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (isRunning) {
            return Service.START_STICKY;
        }

        super.onStartCommand(intent, flags, startId);
        Notification notification = createInitialNotification();
        notificationManager.notify(NOTIFICATION_ID, notification);  // TODO(cais): Is this needed?
        startForeground(NOTIFICATION_ID, notification);

        handler = new Handler();
        Log.i(TAG, "service onStartCommand()"); // DEBUG
        handler.post(new Runnable() {
            @Override
            public void run() {
                Log.i(TAG, "service run()"); // DEBUG
                discoverSpeakFasterObserverService();
                bleScanner.startScan();
                handler.postDelayed(() -> {
                    sendBeaconStatus();
                }, SEND_BEACON_STATUS_PERIOD_MILLIS);
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
        if (activeBeaconAddresses.indexOf(address) == -1) {
            activeBeaconAddresses.add(address);
        }
    }

    public void discoverSpeakFasterObserverService() {
        if (nsdManager == null) {
            Log.w(TAG, "Not scanning for SpeakFaster Observer service because NsdManger is uninitialized.");
            return;
        }

        // Instantiate a new DiscoveryListener
        NsdManager.DiscoveryListener discoveryListener =
                new NsdManager.DiscoveryListener() {
                    // Called as soon as service discovery begins.
                    @Override
                    public void onDiscoveryStarted(String regType) {
                        Log.i(TAG, "onDiscoveryStarted()");  // DEBUG
                    }

                    @Override
                    public void onServiceFound(NsdServiceInfo service) {
                        // A service is found.
                        Log.i(TAG, "onServiceFound()" + service);  // DEBUG
//                        nsdManager.resolveService(service, resolveListener);
                    }

                    @Override
                    public void onServiceLost(NsdServiceInfo service) {
                        // NOTE: we scan for all PUNT37 servers anew each time. So there is no need
                        // to keep track of the previously discovered hosts.
                    }

                    @Override
                    public void onDiscoveryStopped(String serviceType) {
//                        handler.onDiscoveryStopped();
                    }

                    @Override
                    public void onStartDiscoveryFailed(String serviceType, int errorCode) {
                        Log.i(TAG, "onStartDiscoveryFailed():" + serviceType + "; code=" + errorCode);  // DEBUG
//                        log.e(this, "Discovery failed: Error code:" + errorCode);
//                        nsdManager.stopServiceDiscovery(this);
//                        handler.onStartDiscoveryFailed();
                    }

                    @Override
                    public void onStopDiscoveryFailed(String serviceType, int errorCode) {
//                        log.e(this, "Discovery failed: Error code:" + errorCode);
//                        nsdManager.stopServiceDiscovery(this);
                    }

                };
        nsdManager.discoverServices(
                "_spo._tcp", NsdManager.PROTOCOL_DNS_SD, discoveryListener);
    }
}
