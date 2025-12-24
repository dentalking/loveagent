import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Database } from '../types/database.types';

type Scenario = Database['public']['Tables']['scenarios']['Row'];
type ScenarioOption = Database['public']['Tables']['scenario_options']['Row'];

export type ScenarioWithOptions = Scenario & {
  options: ScenarioOption[];
};

export function useScenarios() {
  const [scenarios, setScenarios] = useState<ScenarioWithOptions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchScenarios();
  }, []);

  async function fetchScenarios() {
    try {
      const { data: scenariosData, error: scenariosError } = await supabase
        .from('scenarios')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (scenariosError) throw scenariosError;

      const { data: optionsData, error: optionsError } = await supabase
        .from('scenario_options')
        .select('*')
        .order('display_order');

      if (optionsError) throw optionsError;

      const scenariosWithOptions = scenariosData.map((scenario) => ({
        ...scenario,
        options: optionsData.filter((opt) => opt.scenario_id === scenario.id),
      }));

      setScenarios(scenariosWithOptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch scenarios');
    } finally {
      setLoading(false);
    }
  }

  return { scenarios, loading, error, refetch: fetchScenarios };
}
