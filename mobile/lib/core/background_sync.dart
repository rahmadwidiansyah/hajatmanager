import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:workmanager/workmanager.dart';

import 'api_client.dart';
import 'local_db.dart';
import 'sync_engine.dart';

const backgroundSyncTask = 'hajatmanager.periodic-sync';

@pragma('vm:entry-point')
void backgroundSyncDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    WidgetsFlutterBinding.ensureInitialized();
    if (task != backgroundSyncTask && task != Workmanager.iOSBackgroundTask) {
      return true;
    }
    try {
      await initLocalDb();
      await ApiClient.instance.rebuild();
      await SyncEngine.instance.syncInBackground().timeout(
        const Duration(seconds: 45),
      );
      return true;
    } catch (e) {
      debugPrint('Background sync gagal: $e');
      return false;
    }
  });
}

Future<void> configureBackgroundSync() async {
  if (kIsWeb || !Platform.isAndroid) return;
  await Workmanager().initialize(backgroundSyncDispatcher);
  await Workmanager().registerPeriodicTask(
    'hajatmanager-periodic-sync',
    backgroundSyncTask,
    frequency: const Duration(minutes: 15),
    constraints: Constraints(networkType: NetworkType.connected),
    backoffPolicy: BackoffPolicy.exponential,
    backoffPolicyDelay: const Duration(minutes: 10),
    existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
  );
}
