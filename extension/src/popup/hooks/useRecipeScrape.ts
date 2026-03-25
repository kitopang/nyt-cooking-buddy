import { useState, useEffect } from 'react';
import type { ScrapeResponse, ScrapedRecipe } from '../../shared/types';

type ScrapeState =
  | { status: 'loading' }
  | { status: 'not-recipe' }
  | { status: 'recipe-box' }
  | { status: 'ready'; recipe: ScrapedRecipe }
  | { status: 'error'; error: string };

export function useRecipeScrape(): ScrapeState {
  const [state, setState] = useState<ScrapeState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function scrape() {
      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (cancelled) return;

      // Recipe box page — show the order UI
      if (tab?.url?.match(/^https:\/\/cooking\.nytimes\.com\/recipe-box\//)) {
        setState({ status: 'recipe-box' });
        return;
      }

      // Check if we're on a recipe page
      if (!tab?.url?.match(/^https:\/\/cooking\.nytimes\.com\/recipes\//)) {
        setState({ status: 'not-recipe' });
        return;
      }

      const tabId = tab.id!;

      // Try sending message to content script
      const result = await sendScrapeMessage(tabId);
      if (cancelled) return;

      if (result.success) {
        setState({ status: 'ready', recipe: result.data });
      } else {
        setState({ status: 'error', error: result.error });
      }
    }

    scrape().catch((err: unknown) => {
      if (!cancelled) {
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    });

    return () => { cancelled = true; };
  }, []);

  return state;
}

async function sendScrapeMessage(tabId: number): Promise<ScrapeResponse> {
  // First attempt
  try {
    const response = await new Promise<ScrapeResponse>((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_RECIPE' }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(resp as ScrapeResponse);
        }
      });
    });
    return response;
  } catch {
    // Content script not yet injected (e.g., extension installed while page was already open)
    // Inject it manually and retry
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/scraper.js'],
      });

      return new Promise<ScrapeResponse>((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_RECIPE' }, (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(resp as ScrapeResponse);
          }
        });
      });
    } catch {
      return {
        success: false,
        error: 'Could not connect to the recipe page. Please reload the page and try again.',
      };
    }
  }
}
