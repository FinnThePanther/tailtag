alter view public.catch_mode_default_experiment_results
  set (security_invoker = true);

revoke all on public.catch_mode_default_experiment_results from anon, authenticated;
grant select on public.catch_mode_default_experiment_results to service_role;
