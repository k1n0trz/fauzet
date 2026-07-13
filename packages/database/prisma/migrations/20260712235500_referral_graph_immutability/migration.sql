CREATE FUNCTION "prevent_referral_graph_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Referral attribution graph is immutable';
END;
$$;

CREATE TRIGGER "ReferralProfile_immutable"
BEFORE UPDATE OR DELETE ON "ReferralProfile"
FOR EACH ROW EXECUTE FUNCTION "prevent_referral_graph_mutation"();

CREATE TRIGGER "ReferralEdge_immutable"
BEFORE UPDATE OR DELETE ON "ReferralEdge"
FOR EACH ROW EXECUTE FUNCTION "prevent_referral_graph_mutation"();

CREATE TRIGGER "ReferralAncestor_immutable"
BEFORE UPDATE OR DELETE ON "ReferralAncestor"
FOR EACH ROW EXECUTE FUNCTION "prevent_referral_graph_mutation"();
