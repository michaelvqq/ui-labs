// Moves a story's MountFrame/ListenerFrame into a holder. A holder can outlive its story (LifetimeComponent defers
// unmounting, and open/close/capture/reload can switch holders in the same frame), so the frames may already be
// destroyed (Parent locked): skip quietly instead of throwing inside a React effect.
export function ParentStoryFrames(props: StoryHolderProps, holder: Instance) {
	for (const frame of [props.MountFrame, props.ListenerFrame]) {
		if (frame.Parent === holder) continue;
		pcall(() => {
			frame.Parent = holder;
		});
	}
}
