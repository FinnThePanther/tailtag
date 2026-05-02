const { execFileSync, spawnSync } = require('child_process');

function getConnectedAndroidDevices() {
  const output = execFileSync('adb', ['devices', '-l'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return output
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, status] = line.split(/\s+/);
      const model = line
        .split(/\s+/)
        .find((part) => part.startsWith('model:'))
        ?.replace('model:', '');

      return { id, model, name: model ?? id, status, label: line };
    })
    .filter((device) => device.status === 'device');
}

function resolveAndroidDevice() {
  const devices = getConnectedAndroidDevices();

  if (process.env.ANDROID_DEVICE) {
    const requestedDevice = process.env.ANDROID_DEVICE;
    const matchingDevice = devices.find(
      (device) => device.id === requestedDevice || device.name === requestedDevice,
    );

    if (!matchingDevice) {
      console.error(
        `[run-android] Could not find device matching ANDROID_DEVICE=${requestedDevice}.`,
      );
      devices.forEach((device) => console.error(`  ${device.label}`));
      process.exit(1);
    }

    return matchingDevice.name;
  }

  if (devices.length === 1) {
    return devices[0].name;
  }

  if (devices.length === 0) {
    console.error('[run-android] No connected Android devices found.');
    console.error('[run-android] Start an emulator or connect a device, then rerun the command.');
    process.exit(1);
  }

  console.error(
    '[run-android] Multiple Android devices found. Choose one with ANDROID_DEVICE=<id-or-name>.',
  );
  devices.forEach((device) => console.error(`  ${device.label}`));
  process.exit(1);
}

const deviceName = resolveAndroidDevice();
const args = ['run:android', '--device', deviceName, ...process.argv.slice(2)];
const env = {
  ...process.env,
  CI: process.env.TAILTAG_WATCH === '1' ? process.env.CI : '1',
};

const result = spawnSync('expo', args, {
  env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
