#!/bin/sh
# Installs a daily job on this Mac that keeps the Central Bank of Uzbekistan's official rates in exchange_rate_days
# (npm run rates:fill). cbu.uz answers only addresses in Uzbekistan, so the app's servers cannot read it; this Mac
# can. The job runs at 10:00 and 18:30 and when you log in; a run missed while the Mac sleeps happens on wake, and
# each run also fills the last 14 days, so a gap closes by itself. Re-run this script after moving the checkout or
# upgrading Node (the job remembers both paths). `sh scripts/schedule-rates-fill.sh remove` uninstalls it.
set -eu
label=com.hoggish.rates-fill
plist="$HOME/Library/LaunchAgents/$label.plist"
log="$HOME/Library/Logs/hoggish-rates-fill.log"
domain="gui/$(id -u)"
launchctl bootout "$domain/$label" 2>/dev/null || true
if [ "${1:-}" = remove ]; then rm -f "$plist"; echo "Removed $label."; exit 0; fi

repo=$(cd "$(dirname "$0")/.." && pwd)
node=$(command -v node)
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
 <key>Label</key><string>$label</string>
 <key>WorkingDirectory</key><string>$repo</string>
 <key>ProgramArguments</key>
 <array>
  <string>$node</string>
  <string>--experimental-strip-types</string>
  <string>--experimental-specifier-resolution=node</string>
  <string>scripts/fill-day-rates.mjs</string>
 </array>
 <key>StartCalendarInterval</key>
 <array>
  <dict><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
  <dict><key>Hour</key><integer>18</integer><key>Minute</key><integer>30</integer></dict>
 </array>
 <key>RunAtLoad</key><true/>
 <key>StandardOutPath</key><string>$log</string>
 <key>StandardErrorPath</key><string>$log</string>
</dict>
</plist>
PLIST
launchctl bootstrap "$domain" "$plist"
echo "Installed $label: daily at 10:00 and 18:30 and at login, from $repo. Log: $log"
