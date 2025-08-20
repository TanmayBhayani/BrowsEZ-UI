// import ExtensionStore from '../ExtensionStore';
import { BackgroundMessenger } from '@shared/utils/messaging';
import { apiClient } from '@shared/api/client';
import { ExtensionStore } from '../ExtensionStore';
import { getTabManager } from '../TabManager';

export async function ToggleActiveStateAction(tabId: number, isActive: boolean, domain: string) {
  try {
    const store = ExtensionStore.getInstance();
    store.updateTabState.updateBasicInfo(tabId, {isActive}, false);
    if(isActive){
        store.addActiveDomain(domain);
        // Persist active domains for authenticated users
        try {
          const auth = await apiClient.checkAuth();
          if (auth.authenticated) {
            await apiClient.setActiveDomains(store.activeDomains);
          }
        } catch {}
        // Delegate to TabManager for reconciliation and embedding
        await getTabManager().reconcileTab(tabId);
    }else{
        store.removeActiveDomain(domain);
        // Persist active domains for authenticated users
        try {
          const auth = await apiClient.checkAuth();
          if (auth.authenticated) {
            await apiClient.setActiveDomains(store.activeDomains);
          }
        } catch {}
    }
  } catch (error) {
    console.error('Failed to toggle active state:', error);
  }
}