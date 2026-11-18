import { ConvertedControls } from "@rbxts/ui-labs/src/ControlTypings/Typing";

// Live handles to each mounted story's controls, keyed by preview key, so the agent bridge can read and set them.
// Registered from the mounters' shared hook (useStoryActionComponents), which every library mounter calls.

export interface AgentControlHandle {
	Controls: ConvertedControls;
	Values: ParametrizedControls;
	SetValues: (values: ParametrizedControls) => void;
	Updated: number;
}

const handles = new Map<string, AgentControlHandle>();

export function RegisterControlHandle(key: string, handle: AgentControlHandle) {
	handles.set(key, handle);
}

export function UnregisterControlHandle(key: string, handle: AgentControlHandle) {
	if (handles.get(key) === handle) handles.delete(key);
}

export function GetControlHandle(key: string) {
	return handles.get(key);
}
