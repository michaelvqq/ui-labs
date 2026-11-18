import { useEventListener } from "@rbxts/pretty-react-hooks";
import React, { useBinding, useEffect, useMemo, useState } from "@rbxts/react";
import { useProducer, useSelector } from "@rbxts/react-reflex";
import { createPortal } from "@rbxts/react-roblox";
import { CoreGui, GuiService, Selection } from "@rbxts/services";
import { setInterval } from "@rbxts/set-timeout";
import { usePlugin } from "Hooks/Reflex/Use/Plugin";
import { selectCommentTool, selectSelectTool, selectTweakTool } from "Reflex/Interface";
import CommentElements from "UI/StoryPanel/StoryTools/CommentElements";
import TweakElements from "UI/StoryPanel/StoryTools/TweakElements";
import ComponentHighlight from "UI/StoryPanel/StoryTools/SelectElements/Highlight";
import { GetGuisAtPosition } from "UI/StoryPanel/StoryTools/SelectElements/Utils";

interface ViewportToolsProps {
	PreviewEntry: PreviewEntry;
}

// Select Elements and Comment For AI for stories shown on the viewport (View On Viewport / agent capture).
// While a tool is on, the plugin takes the viewport mouse (plugin:Activate) so clicks don't select parts.
// The overlay lives in CoreGui, so it never shows up in screen_capture images.
function ViewportTools(props: ViewportToolsProps) {
	const plugin = usePlugin();
	const selectTool = useSelector(selectSelectTool);
	const commentTool = useSelector(selectCommentTool);
	const tweakTool = useSelector(selectTweakTool);
	const { setSelectTool, setCommentTool, setTweakTool } = useProducer<RootProducer>();
	const active = selectTool || commentTool || tweakTool;
	const holder = props.PreviewEntry.Holder;
	const [anchor] = useBinding(Vector2.zero);
	const [hovered, setHovered] = useState<GuiObject>();

	const storyGui = holder?.FindFirstAncestorOfClass("ScreenGui");
	const ignoreInset = storyGui?.IgnoreGuiInset ?? false;

	const mouse = useMemo(() => (active && plugin ? plugin.GetMouse() : undefined), [active, plugin]);
	// PluginMouse.Button1Down doesn't fire over GUI, so a transparent catcher on top of the story takes the clicks
	// (which also keeps them from pressing the story's own buttons)
	const clicked = useMemo(() => new Instance("BindableEvent"), []);
	useEffect(() => () => clicked.Destroy(), [clicked]);

	// PluginMouse X/Y are below the top inset, like a non-IgnoreGuiInset ScreenGui
	const getMouse = () => {
		if (!mouse) return Vector2.zero;
		const position = new Vector2(mouse.X, mouse.Y);
		return ignoreInset ? position.add(GuiService.GetGuiInset()[0]) : position;
	};

	useEffect(() => {
		if (!active || !plugin) return;
		plugin.Activate(true);
		const deactivated = plugin.Deactivation.Connect(() => {
			setSelectTool(false);
			setCommentTool(false);
			setTweakTool(false);
		});
		return () => {
			deactivated.Disconnect();
			if (plugin.IsActivated()) plugin.Deactivate();
		};
	}, [active, plugin]);

	useEffect(() => {
		if (!selectTool || commentTool || tweakTool || !holder || !mouse) {
			setHovered(undefined);
			return;
		}
		return setInterval(() => setHovered(GetGuisAtPosition(holder, getMouse())[0]), 0.1);
	}, [selectTool, commentTool, tweakTool, holder, mouse, ignoreInset]);

	useEventListener(selectTool && !commentTool && !tweakTool ? clicked.Event : undefined, () => {
		if (hovered) Selection.Set([hovered]);
	});

	if (!active || !holder || !mouse) return <></>;

	return createPortal(
		<screengui
			key={"AILabsViewportTools"}
			DisplayOrder={100001}
			IgnoreGuiInset={ignoreInset}
			ZIndexBehavior={Enum.ZIndexBehavior.Sibling}
			Archivable={false}
		>
			<textbutton
				key={"ClickCatcher"}
				Size={UDim2.fromScale(1, 1)}
				BackgroundTransparency={1}
				Text={""}
				AutoButtonColor={false}
				ZIndex={0}
				Event={{ MouseButton1Down: () => clicked.Fire() }}
			/>
			{tweakTool ? (
				<TweakElements
					Inside={true}
					Anchor={anchor}
					PreviewEntry={props.PreviewEntry}
					Viewport={{ GetMouse: getMouse, Clicked: clicked.Event }}
				/>
			) : commentTool ? (
				<CommentElements
					Inside={true}
					Anchor={anchor}
					PreviewEntry={props.PreviewEntry}
					Viewport={{ GetMouse: getMouse, Clicked: clicked.Event }}
				/>
			) : hovered ? (
				<ComponentHighlight UIComponent={hovered} Holder={holder} Inset={anchor} />
			) : undefined}
		</screengui>,
		CoreGui
	);
}

export default ViewportTools;
