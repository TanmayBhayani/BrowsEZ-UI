// import ExtensionStore from '../ExtensionStore';
import { BackgroundMessenger } from '@shared/utils/messaging';
import { apiClient } from '@shared/api/client';
import { ExtensionStore } from '../ExtensionStore';

export async function ToggleActiveStateAction(tabId: number, isActive: boolean, domain: string) {
  try {
    const store = ExtensionStore.getInstance();
    store.updateTabState.updateBasicInfo(tabId, {isActive}, false);
    if(isActive){
        store.addActiveDomain(domain);
        const htmlResponse = await BackgroundMessenger.getPageHTML(tabId);
        if(htmlResponse.success){
            const html = htmlResponse.data.html;
            store.updateTabState.updateHTMLProcessingStatus(tabId, 'processing');
            const response = await apiClient.sendHTML(html, tabId);
            if(response.status === 200){
                store.updateTabState.updateHTMLProcessingStatus(tabId, 'ready');
            }else{
                store.updateTabState.updateHTMLProcessingStatus(tabId, 'error');
            }
        }
    }else{
        store.removeActiveDomain(domain);
    }
  } catch (error) {
    console.error('Failed to toggle active state:', error);
  }
}