import React, { useBinding } from "@rbxts/react";
import { useSelector } from "@rbxts/react-reflex";
import { useToolbarHovered } from "Context/StoryPanelContext";
import { useToggler } from "Hooks/Utils/Toggler";
import { selectCommentTool, selectMeasureTool, selectTweakTool, selectMouseRules, selectSelectTool, selectShowOutlines } from "Reflex/Interface";
import { Div } from "UI/Styles/Div";

import CommentElements from "./CommentElements";
import MeasureTool from "./MeasureTool";
import MouseRules from "./MouseRules";
import SelectElements from "./SelectElements";
import ShowOutlines from "./ShowOutlines";
import TweakElements from "./TweakElements";

interface StoryToolsProps {
	PreviewEntry: PreviewEntry;
}

function StoryTools(props: StoryToolsProps) {
	const [inside, insideApi] = useToggler(false);
	const [anchor, setAnchor] = useBinding<Vector2>(Vector2.zero);

	const isInside = inside && !props.PreviewEntry.OnViewport && !props.PreviewEntry.OnWidget;
	const [toolbarHovered] = useToolbarHovered();

	const measureTool = useSelector(selectMeasureTool);
	const selectTool = useSelector(selectSelectTool);
	const showOutlines = useSelector(selectShowOutlines);
	const commentTool = useSelector(selectCommentTool);
	const tweakTool = useSelector(selectTweakTool);
	const mouseRules = useSelector(selectMouseRules);

	return (
		<Div
			Event={{
				MouseEnter: insideApi.enable,
				MouseLeave: insideApi.disable
			}}
			Change={{
				AbsolutePosition: (frame) => setAnchor(frame.AbsolutePosition)
			}}
			ZIndex={2}
		>
			{measureTool ? <MeasureTool Inside={isInside} Anchor={anchor} /> : undefined}
			{selectTool ? <SelectElements Inside={isInside} Anchor={anchor} PreviewEntry={props.PreviewEntry} /> : undefined}
			{commentTool ? (
				<CommentElements Inside={isInside} Anchor={anchor} PreviewEntry={props.PreviewEntry} />
			) : undefined}
			{tweakTool ? <TweakElements Inside={isInside} Anchor={anchor} PreviewEntry={props.PreviewEntry} /> : undefined}
			{showOutlines ? <ShowOutlines Anchor={anchor} PreviewEntry={props.PreviewEntry} /> : undefined}
			{mouseRules ? <MouseRules Inside={isInside} Anchor={anchor} PreviewEntry={props.PreviewEntry} /> : undefined}
		</Div>
	);
}

export default StoryTools;
