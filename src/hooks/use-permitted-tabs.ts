"use client";

import { useEffect, useMemo } from "react";

import { useAdminSession } from "@/components/admin/admin-session-provider";
import {
  ADMIN_TAB_PERMISSIONS,
  firstPermittedTab,
  hasPermission,
  type AdminPermission,
} from "@/lib/admin-permissions";
import { useTabParam } from "@/hooks/use-tab-param";

type UsePermittedTabsOptions = {
  pagePath: string;
  defaultTab: string;
  tabParamKey?: string;
};

/**
 * Keeps URL tab state in sync with staff permissions: hides disallowed tabs and
 * redirects to the first allowed tab when the current one is forbidden.
 */
export function usePermittedTabs({
  pagePath,
  defaultTab,
  tabParamKey = "tab",
}: UsePermittedTabsOptions) {
  const { user, can } = useAdminSession();
  const [activeTab, setActiveTab] = useTabParam(defaultTab, tabParamKey);

  const tabMap = ADMIN_TAB_PERMISSIONS[pagePath];

  const permittedTabs = useMemo(() => {
    if (!tabMap) return [defaultTab];
    return Object.entries(tabMap)
      .filter(([, permission]) => can(permission))
      .map(([tab]) => tab);
  }, [tabMap, can, defaultTab]);

  const resolvedTab = useMemo(() => {
    if (permittedTabs.includes(activeTab)) return activeTab;
    if (!user) return defaultTab;
    return firstPermittedTab(
      user ? { role: user.role, permissions: user.permissions } : null,
      pagePath,
      defaultTab,
    );
  }, [activeTab, permittedTabs, user, pagePath, defaultTab]);

  useEffect(() => {
    if (resolvedTab !== activeTab) {
      setActiveTab(resolvedTab);
    }
  }, [resolvedTab, activeTab, setActiveTab]);

  const canTab = (tab: string): boolean => {
    const permission = tabMap?.[tab] as AdminPermission | undefined;
    if (!permission) return true;
    return hasPermission(
      user ? { role: user.role, permissions: user.permissions } : null,
      permission,
    );
  };

  return {
    activeTab: resolvedTab,
    setActiveTab,
    permittedTabs,
    canTab,
  };
}
