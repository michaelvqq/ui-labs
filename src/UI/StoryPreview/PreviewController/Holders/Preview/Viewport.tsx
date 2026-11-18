import React, { useEffect, useRef, useState } from "@rbxts/react";
import { createPortal } from "@rbxts/react-roblox";
import { StarterGui, Workspace } from "@rbxts/services";
import { useWidgetStateContext } from "Context/WidgetStateContext";
import { RemoveExtension } from "Hooks/Reflex/Control/ModuleList/Utils";
import Configs from "Plugin/Configs";
import { useDeferLifetime } from "UI/Holders/LifetimeChildren/LifetimeController";
import { Div } from "UI/Styles/Div";

import ViewportTools from "./ViewportTools";
import { ParentStoryFrames } from "./ParentStory";

export const CAPTURE_GUI_NAME = "UILabsCapture";

function useViewportSize() {
	const camera = Workspace.CurrentCamera;
	const [size, setSize] = useState(camera ? camera.ViewportSize : new Vector2(1920, 1080));
	useEffect(() => {
		if (!camera) return;
		const connection = camera.GetPropertyChangedSignal("ViewportSize").Connect(() => setSize(camera.ViewportSize));
		return () => connection.Disconnect();
	}, [camera]);
	return size;
}

function Viewport(props: StoryHolderProps) {
	const mountRef = useRef<Frame>();
	const widgetState = useWidgetStateContext();
	const storyName = RemoveExtension(props.PreviewEntry.Module.Name, Configs.Extensions.Story);
	const capture = props.PreviewEntry.Capture;
	const viewportSize = useViewportSize();

	useDeferLifetime(props, 2);

	// Re-parent whenever the holder switches between CoreGui and the capture ScreenGui
	const isCapture = capture !== undefined;
	useEffect(() => {
		const holder = mountRef.current;
		if (!holder) return;
		ParentStoryFrames(props, holder);
	}, [isCapture]);

	useEffect(() => {
		props.SetCanReload(widgetState.ViewportFocused);
	}, [widgetState.ViewportFocused, props.SetCanReload]);

	const tools = <ViewportTools PreviewEntry={props.PreviewEntry} />;

	if (capture === undefined) {
		const gui = createPortal(
			<screengui key={storyName} ZIndexBehavior={Enum.ZIndexBehavior.Sibling}>
				<Div key={"Holder"} ref={mountRef}></Div>
			</screengui>,
			game.GetService("CoreGui")
		);
		return (
			<>
				{gui}
				{tools}
			</>
		);
	}

	// Capture mode: StarterGui (visible to Studio's screen_capture), never saved with the place
	const frameSize = capture.Size ?? viewportSize;
	const fit = math.min(1, viewportSize.X / frameSize.X, viewportSize.Y / frameSize.Y);

	const captureGui = createPortal(
		<screengui
			key={CAPTURE_GUI_NAME}
			ZIndexBehavior={Enum.ZIndexBehavior.Sibling}
			DisplayOrder={100000}
			IgnoreGuiInset={true}
			Archivable={false}
		>
			<frame
				key={"Background"}
				Size={UDim2.fromScale(1, 1)}
				BackgroundColor3={capture.Background ?? Color3.fromRGB(30, 30, 30)}
				BackgroundTransparency={capture.BackgroundTransparency ?? 0}
				BorderSizePixel={0}
			/>
			<frame
				key={"Frame"}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={UDim2.fromScale(0.5, 0.5)}
				Size={UDim2.fromOffset(frameSize.X, frameSize.Y)}
				BackgroundTransparency={1}
				ClipsDescendants={true}
				ZIndex={2}
			>
				<uiscale Scale={fit} />
				<Div key={"Holder"} ref={mountRef}></Div>
			</frame>
		</screengui>,
		StarterGui
	);
	return (
		<>
			{captureGui}
			{tools}
		</>
	);
}

export default Viewport;
