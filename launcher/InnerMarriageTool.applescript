-- Double-click launcher: starts the Inner Marriage Flask app in the
-- background (if not already running) and opens it in the default browser.
-- No Terminal window is shown.

on run
	set projectDir to "/Users/amelia/Documents/Projects/astrology-charts"
	set venvPython to projectDir & "/.venv/bin/python3"
	set appScript to projectDir & "/inner_marriage_app.py"
	set logFile to "/tmp/inner_marriage_app.log"
	set appURL to "http://127.0.0.1:5050"

	-- Checking readiness by whether the port actually answers (rather than
	-- tracking a PID) sidesteps shell-backgrounding PID quirks entirely and
	-- is what we actually care about: is the server reachable yet.
	set startScript to "cd " & quoted form of projectDir & "; if ! nc -z 127.0.0.1 5050 2>/dev/null; then nohup " & quoted form of venvPython & " " & quoted form of appScript & " > " & quoted form of logFile & " 2>&1 & for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do sleep 0.5; nc -z 127.0.0.1 5050 2>/dev/null && break; done; fi"

	try
		do shell script startScript
	on error errMsg
		display alert "Couldn't start the Inner Marriage tool" message errMsg
		return
	end try

	set isReady to do shell script "nc -z 127.0.0.1 5050 2>/dev/null && echo yes || echo no"
	if isReady is not "yes" then
		display alert "The Inner Marriage tool didn't start in time" message "Check " & logFile & " for details."
		return
	end if

	open location appURL
end run
