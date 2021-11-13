package org.teamgleason.speakfaster;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Binder;
import android.os.Handler;
import android.os.IBinder;
import android.util.Log;
import android.widget.Toast;


public class BleScanService extends Service {
    private static final String TAG = "BleScanService";
    private static final int NOTIFICATION_ID = 1;
    private final LocalBinder binder = new LocalBinder();
    private NotificationManager notificationManager;
    private Handler handler;

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
        Log.i(TAG, "service onCreate()");  // DEBUG
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.i(TAG, "service onDestroy()");  // DEBUG
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
//                .setContentIntent(pendingIntent)
//                .setOngoing(true)
//                .setChannelId("SpeakFaster")
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
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
            }
        });
        return Service.START_STICKY;
    }


}
