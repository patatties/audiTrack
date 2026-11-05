import { useQuery } from "@tanstack/react-query";
import type { Client, Finding, Location, Control, ControlCatalog } from "@/lib/types";
import { getBootstrapData } from "@/lib/bootstrap";

export function useControlCatalog() {
  return useQuery({
    queryKey: ["control_catalog"],
    queryFn: async (): Promise<ControlCatalog[]> => {
      const data = await getBootstrapData();
      return data.control_catalog;
    },
  });
}

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async (): Promise<Client[]> => {
      const data = await getBootstrapData();
      return data.clients;
    },
  });
}

export function useLocations(clientId?: string) {
  return useQuery({
    queryKey: ["locations", clientId ?? "all"],
    queryFn: async (): Promise<Location[]> => {
      const data = await getBootstrapData();
      const locations = data.locations;
      return clientId ? locations.filter((l) => l.client_id === clientId) : locations;
    },
  });
}

export function useControls(locationId?: string) {
  return useQuery({
    queryKey: ["controls", locationId ?? "all"],
    queryFn: async (): Promise<Control[]> => {
      const data = await getBootstrapData();

      if (!locationId) return data.controls;

      const linkedControlIds = data.control_locations
        .filter((link) => link.location_id === locationId)
        .map((link) => link.control_id);

      return data.controls.filter((control) => control.applies_to_all || linkedControlIds.includes(control.id));
    },
  });
}

export function useAllFindings() {
  return useQuery({
    queryKey: ["findings", "all"],
    queryFn: async (): Promise<Finding[]> => {
      const data = await getBootstrapData();
      return data.findings;
    },
  });
}

export function useFinding(id: string | undefined) {
  return useQuery({
    queryKey: ["finding", id],
    enabled: !!id,
    queryFn: async (): Promise<Finding | null> => {
      if (!id) return null;
      const data = await getBootstrapData();
      return data.findings.find((finding) => finding.id === id) ?? null;
    },
  });
}

export function useControlLocations(catalogId: string | undefined) {
  return useQuery({
    queryKey: ["control_locations", "catalog", catalogId],
    enabled: !!catalogId,
    queryFn: async (): Promise<string[]> => {
      if (!catalogId) return [];

      const data = await getBootstrapData();

      const controlIds = data.controls
        .filter((control) => control.catalog_id === catalogId)
        .map((control) => control.id);

      if (controlIds.length === 0) return [];

      return Array.from(
        new Set(
          data.control_locations
            .filter((link) => controlIds.includes(link.control_id))
            .map((link) => link.location_id)
        )
      );
    },
  });
}

export function useAllControlLocations() {
  return useQuery({
    queryKey: ["control_locations", "all"],
    queryFn: async (): Promise<{ control_id: string; location_id: string }[]> => {
      const data = await getBootstrapData();
      return data.control_locations;
    },
  });
}
