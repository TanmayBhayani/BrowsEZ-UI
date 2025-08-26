// import ExtensionStore from '../ExtensionStore';
import { BackgroundMessenger } from '@shared/utils/messaging';
import { apiClient } from '@shared/api/client';
import { ExtensionStore } from '../ExtensionStore';
import { getTabManager } from '../TabManager';

export async function ToggleActiveStateAction(tabId: number, isActive: boolean, domain: string) {
  console.log('Starting Toggle Active State Action...');
  try {
    const store = ExtensionStore.getInstance();
    store.updateTabState.updateBasicInfo(tabId, {isActive}, false);
    if(isActive){
      console.log('Adding active domain:', domain);
      store.addActiveDomain(domain);
      // Persist active domains for authenticated users
      try {
        const auth = await apiClient.checkAuth();
        if (auth.authenticated) {
          await apiClient.setActiveDomains(store.activeDomains);
        }
        else {
          store.updateTabState.setError(tabId,{code: 'AUTH_ERROR', message: 'User is not authenticated'});
        }
      } catch {}
      // Delegate to TabManager for reconciliation and embedding
      await getTabManager().reconcileTab(tabId);
    }else{
      console.log('Removing active domain:', domain);
      store.removeActiveDomain(domain);
      // Persist active domains for authenticated users
      try {
        const auth = await apiClient.checkAuth();
        if (auth.authenticated) {
          await apiClient.setActiveDomains(store.activeDomains);
        }
        else {
          store.updateTabState.setError(tabId,{code: 'AUTH_ERROR', message: 'User is not authenticated'});
        }
      } catch {}
    }
  } catch (error) {
    console.error('Failed to toggle active state:', error);
  }
}