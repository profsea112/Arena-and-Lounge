CREATE TABLE public.staff_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text NOT NULL DEFAULT '',
  action text NOT NULL,
  entity_type text NOT NULL DEFAULT 'system',
  entity_id uuid,
  entity_label text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX staff_audit_log_created_at_idx ON public.staff_audit_log (created_at DESC);
CREATE INDEX staff_audit_log_action_idx ON public.staff_audit_log (action);

GRANT SELECT, INSERT ON public.staff_audit_log TO authenticated;
GRANT ALL ON public.staff_audit_log TO service_role;

ALTER TABLE public.staff_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit log readable by staff" ON public.staff_audit_log
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "signed in users log their own actions" ON public.staff_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

ALTER TABLE public.staff_audit_log REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_audit_log;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;