CREATE FUNCTION "reject_referral_edge_cycle"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ReferralAncestor"
    WHERE "descendantId" = NEW."sponsorId"
      AND "ancestorId" = NEW."referredUserId"
  ) THEN
    RAISE EXCEPTION 'Referral cycle is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ReferralEdge_cycle_guard"
BEFORE INSERT ON "ReferralEdge"
FOR EACH ROW EXECUTE FUNCTION "reject_referral_edge_cycle"();

CREATE FUNCTION "reject_referral_ancestor_cycle"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ReferralAncestor"
    WHERE "descendantId" = NEW."ancestorId"
      AND "ancestorId" = NEW."descendantId"
  ) THEN
    RAISE EXCEPTION 'Referral ancestry cycle is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ReferralAncestor_cycle_guard"
BEFORE INSERT ON "ReferralAncestor"
FOR EACH ROW EXECUTE FUNCTION "reject_referral_ancestor_cycle"();
