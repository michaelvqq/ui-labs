import { createProducer } from "@rbxts/reflex";
import Sift from "@rbxts/sift";

interface InterfaceState {
	holder?: Frame;
	mousepos: Vector2;
	mouseIconActions: Set<string>;
	recomputeStorybooksKey: {};

	fullscreen: boolean;
	measureTool: boolean;
	selectTool: boolean;
	commentTool: boolean;
	tweakTool: boolean;
	commentsPanel: boolean;
	pageComposer: boolean;
	showOutlines: boolean;
	mouseRules: boolean;
	storyLock: Set<string>;
}

const initialState: InterfaceState = {
	holder: undefined,
	mousepos: Vector2.zero,
	mouseIconActions: new Set(),
	recomputeStorybooksKey: {},

	fullscreen: false,
	measureTool: false,
	selectTool: false,
	commentTool: false,
	tweakTool: false,
	commentsPanel: false,
	pageComposer: false,
	showOutlines: false,
	mouseRules: false,
	storyLock: new Set()
};

export const selectInterface = (state: RootState) => state.interface;
export const selectHolder = (state: RootState) => state.interface.holder;
export const selectMouseIconActions = (state: RootState) => state.interface.mouseIconActions;
export const selectRecomputeStorybooksKey = (state: RootState) => state.interface.recomputeStorybooksKey;

export const selectFullscreen = (state: RootState) => state.interface.fullscreen;
export const selectMeasureTool = (state: RootState) => state.interface.measureTool;
export const selectSelectTool = (state: RootState) => state.interface.selectTool;
export const selectCommentTool = (state: RootState) => state.interface.commentTool;
export const selectTweakTool = (state: RootState) => state.interface.tweakTool;
export const selectCommentsPanel = (state: RootState) => state.interface.commentsPanel;
export const selectPageComposer = (state: RootState) => state.interface.pageComposer;
export const selectShowOutlines = (state: RootState) => state.interface.showOutlines;
export const selectMouseRules = (state: RootState) => state.interface.mouseRules;
export const selectStoryLock = (state: RootState) => state.interface.storyLock;

export const InterfaceProducer = createProducer(initialState, {
	setHolder: (state, holder: Frame) => {
		return { ...state, holder };
	},
	recomputeStorybooks: (state) => {
		return { ...state, recomputeStorybooksKey: {} };
	},
	setMousePos: (state, position: Vector2) => {
		return { ...state, mousepos: position };
	},
	addMouseIconAction: (state, action: string) => {
		return { ...state, mouseIconActions: Sift.Set.add(state.mouseIconActions, action) };
	},
	removeMouseIconAction: (state, action: string) => {
		return { ...state, mouseIconActions: Sift.Set.delete(state.mouseIconActions, action) };
	},

	setFullscreen: (state, fullscreen: boolean) => {
		return { ...state, fullscreen };
	},
	setMeasureTool: (state, active: boolean) => {
		return { ...state, measureTool: active };
	},
	setSelectTool: (state, active: boolean) => {
		return { ...state, selectTool: active };
	},
	setPageComposer: (state, open: boolean) => {
		return { ...state, pageComposer: open, commentsPanel: open ? true : state.commentsPanel };
	},
	setCommentsPanel: (state, open: boolean) => {
		return { ...state, commentsPanel: open };
	},
	setTweakTool: (state, active: boolean) => {
		return { ...state, tweakTool: active };
	},
	setCommentTool: (state, active: boolean) => {
		return { ...state, commentTool: active };
	},
	setShowOutlines: (state, active: boolean) => {
		return { ...state, showOutlines: active };
	},
	setMouseRules: (state, active: boolean) => {
		return { ...state, mouseRules: active };
	},
	lockStoryFrame: (state, locker: string) => {
		if (state.storyLock.has(locker)) return state;
		return { ...state, storyLock: Sift.Set.add(state.storyLock, locker) };
	},
	unlockStoryFrame: (state, locker: string) => {
		return {
			...state,
			storyLock: Sift.Set.delete(state.storyLock, locker)
		};
	}
});
