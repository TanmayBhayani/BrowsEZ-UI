import { ExtensionStore } from "../ExtensionStore";

export function isDomainActive(url: string): boolean {
    if (!url) return false;
    try {
      const domain = new URL(url).hostname;
      const activeDomains = ExtensionStore.getInstance().activeDomains;
      return activeDomains.some(activeDomain => 
        domain === activeDomain || 
        (activeDomain !== "" && domain.includes(activeDomain))
      );
    } catch (e) {
      return false;
    }
  }