import { LogService } from "@rbxts/services";

// Collects warnings/errors so the agent bridge can hand them back to the caller as data.
// UILabsWarn pushes here directly; Output warnings/errors (LogService) are always recorded (last 200).

export interface AgentLogEntry {
	Kind: "warning" | "error" | "info";
	Source: "uilabs" | "output";
	Message: string;
	Time: number;
}

const MAX_ENTRIES = 200;
const entries: AgentLogEntry[] = [];

function Push(entry: AgentLogEntry) {
	entries.push(entry);
	if (entries.size() > MAX_ENTRIES) entries.remove(0);
}

export function AgentLogUILabs(message: string) {
	Push({ Kind: "warning", Source: "uilabs", Message: message, Time: os.clock() });
}

LogService.MessageOut.Connect((message, messageType) => {
	if (messageType === Enum.MessageType.MessageError) {
		Push({ Kind: "error", Source: "output", Message: message, Time: os.clock() });
	} else if (messageType === Enum.MessageType.MessageWarning) {
		// UILabsWarn already recorded its own warnings
		if (message.sub(1, 11) === "[UI Labs]: ") return;
		Push({ Kind: "warning", Source: "output", Message: message, Time: os.clock() });
	}
});

/** Runs `fn` while recording Output warnings/errors, then returns everything logged since it started. */
export function AgentLogCapture<T>(fn: () => T): LuaTuple<[T, AgentLogEntry[]]> {
	const start = os.clock();
	const [ok, result] = pcall(fn);
	const logged = entries.filter((entry) => entry.Time >= start);
	if (!ok) {
		logged.push({ Kind: "error", Source: "uilabs", Message: tostring(result), Time: os.clock() });
		return $tuple(undefined as T, logged);
	}
	return $tuple(result as T, logged);
}

export function AgentLogSince(time: number) {
	return entries.filter((entry) => entry.Time >= time);
}

export function AgentLogClear() {
	entries.clear();
}
