-- A paired browser's Web Push subscription (endpoint, keys and the device's platform as JSON); the row goes with the device.
ALTER TABLE device ADD COLUMN web_push TEXT;
