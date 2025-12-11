/**
 * Onboarding Store (Zustand)
 * Manages first-time user experience state
 * Session-scoped: hasSeenWelcome resets on page load to show when explorer is empty
 */

import { create } from "zustand";

// Version number for future UX changes that should re-trigger onboarding
const ONBOARDING_VERSION = 1;

interface OnboardingState {
	// Session-scoped: resets on page load
	hasSeenWelcomeThisSession: boolean;

	// Persistent: tracks if user has ever completed onboarding
	hasCompletedOnboarding: boolean;
	hasRunWelcomeQueries: boolean;

	// For future UX changes that should re-trigger onboarding
	lastSeenVersion: number;

	// Loading state for async operations
	isRunningWelcomeQueries: boolean;
}

interface OnboardingActions {
	markWelcomeSeenThisSession: () => void;
	markOnboardingComplete: () => void;
	markQueriesRun: () => void;
	setIsRunningQueries: (running: boolean) => void;
	resetOnboarding: () => void;
}

export type OnboardingStore = OnboardingState & OnboardingActions;

// Only persist certain fields to localStorage
const STORAGE_KEY = "dbxlite-onboarding";

// Load persistent state from localStorage
const loadPersistedState = (): Partial<OnboardingState> => {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			const parsed = JSON.parse(saved);
			return {
				hasCompletedOnboarding: parsed.hasCompletedOnboarding ?? false,
				hasRunWelcomeQueries: parsed.hasRunWelcomeQueries ?? false,
				lastSeenVersion: parsed.lastSeenVersion ?? 0,
			};
		}
	} catch (e) {
		console.warn("Failed to load onboarding state:", e);
	}
	return {};
};

// Save persistent state to localStorage
const savePersistedState = (state: Partial<OnboardingState>) => {
	try {
		const toSave = {
			hasCompletedOnboarding: state.hasCompletedOnboarding,
			hasRunWelcomeQueries: state.hasRunWelcomeQueries,
			lastSeenVersion: state.lastSeenVersion,
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
	} catch (e) {
		console.warn("Failed to save onboarding state:", e);
	}
};

const persistedState = loadPersistedState();

// Check if we should re-show onboarding due to version change
const shouldResetForVersion =
	(persistedState.lastSeenVersion ?? 0) < ONBOARDING_VERSION;

export const useOnboardingStore = create<OnboardingStore>()((set, get) => ({
	// Session state (always starts fresh)
	hasSeenWelcomeThisSession: false,
	isRunningWelcomeQueries: false,

	// Persistent state (loaded from localStorage, reset if version changed)
	hasCompletedOnboarding: shouldResetForVersion
		? false
		: (persistedState.hasCompletedOnboarding ?? false),
	hasRunWelcomeQueries: shouldResetForVersion
		? false
		: (persistedState.hasRunWelcomeQueries ?? false),
	lastSeenVersion: ONBOARDING_VERSION,

	markWelcomeSeenThisSession: () => {
		set({ hasSeenWelcomeThisSession: true });
	},

	markOnboardingComplete: () => {
		const newState = {
			hasCompletedOnboarding: true,
			lastSeenVersion: ONBOARDING_VERSION,
		};
		set(newState);
		savePersistedState({ ...get(), ...newState });
	},

	markQueriesRun: () => {
		const newState = { hasRunWelcomeQueries: true };
		set(newState);
		savePersistedState({ ...get(), ...newState });
	},

	setIsRunningQueries: (running: boolean) => {
		set({ isRunningWelcomeQueries: running });
	},

	resetOnboarding: () => {
		const newState = {
			hasSeenWelcomeThisSession: false,
			hasCompletedOnboarding: false,
			hasRunWelcomeQueries: false,
			lastSeenVersion: ONBOARDING_VERSION,
			isRunningWelcomeQueries: false,
		};
		set(newState);
		savePersistedState(newState);
	},
}));

// Selector hooks
export const useHasSeenWelcomeThisSession = () =>
	useOnboardingStore((s) => s.hasSeenWelcomeThisSession);
export const useHasCompletedOnboarding = () =>
	useOnboardingStore((s) => s.hasCompletedOnboarding);
export const useIsRunningWelcomeQueries = () =>
	useOnboardingStore((s) => s.isRunningWelcomeQueries);
