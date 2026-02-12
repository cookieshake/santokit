# Disaster Recovery & Business Continuity

This document defines backup, restore, and failover procedures for the Santokit platform to ensure business continuity in case of catastrophic failures.

---

## 1. Overview

### 1.1 Recovery Objectives

| Metric | Target | Definition |
|--------|--------|------------|
| **RPO** (Recovery Point Objective) | 1 hour | Maximum acceptable data loss |
| **RTO** (Recovery Time Objective) | 4 hours | Maximum acceptable downtime |
| **MTTR** (Mean Time To Recovery) | < 2 hours | Average time to restore service |

### 1.2 Disaster Scenarios

| Scenario | Likelihood | Impact | Recovery Strategy |
|----------|-----------|--------|-------------------|
| Hub DB corruption | Low | Critical | Point-in-time restore |
| Hub instance failure | Medium | High | Auto-failover (multi-AZ) |
| Bridge instance failure | High | Low | Auto-scaling (ephemeral) |
| BYO DB failure | Medium | Critical | Customer responsibility |
| Region outage (AWS/Azure) | Very Low | Critical | Multi-region failover |
| Data center fire/flood | Very Low | Critical | Geo-redundant backups |
| Ransomware attack | Low | Critical | Immutable backups + rebuild |

---

## 2. Backup Strategy

### 2.1 Hub Database (Control Plane)

#### What to Back Up

- **Releases** — Schema, permissions, logic definitions
- **Audit logs** — Operator actions (compliance requirement)
- **Secrets** — API keys, service tokens, signing keys
- **Org/Project metadata** — Teams, members, RBAC

#### Backup Schedule

**Automated Backups (AWS RDS):**
- **Continuous backup** — Transaction logs (WAL) streamed to S3
- **Hourly snapshots** — Automated snapshots every hour
- **Daily snapshots** — Full snapshot at 2 AM UTC
- **Retention** — 7 days (hourly), 30 days (daily), 365 days (monthly)

**Manual Backups:**
- Before major upgrades (Hub version bump)
- Before destructive schema migrations

#### Backup Verification

**Weekly test restore:**
```bash
# Restore to test environment
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier hub-test-restore \
  --db-snapshot-identifier hub-prod-2026-02-10-02-00

# Verify data integrity
stk hub verify-backup --snapshot hub-test-restore

# Cleanup
aws rds delete-db-instance --db-instance-identifier hub-test-restore --skip-final-snapshot
```

---

### 2.2 Audit Log Archival

#### Long-Term Retention

**S3 Lifecycle:**
- **Hot storage** (0-90 days) — S3 Standard, queryable via Athena
- **Cold storage** (90-365 days) — S3 Glacier Instant Retrieval
- **Archive** (> 365 days) — S3 Glacier Deep Archive (compliance)

**Export Schedule:**
```bash
# Daily export (automated cron job on Hub)
psql $HUB_DB_URL -c "COPY (
  SELECT * FROM audit_log WHERE timestamp >= NOW() - INTERVAL '1 day'
) TO STDOUT WITH CSV HEADER" | \
  gzip | \
  aws s3 cp - s3://santokit-audit-archive/$(date +%Y/%m/%d)/audit.csv.gz

# Enable S3 Object Lock (immutable, prevent deletion/modification)
aws s3api put-object-lock-configuration \
  --bucket santokit-audit-archive \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Years":7}}}'
```

---

### 2.3 Secrets Backup

#### Key Material Storage

**Signing Keys (JWT):**
- Backed up to AWS Secrets Manager (encrypted at rest)
- Versioned (old keys retained for token verification)
- Replicated to secondary region

**API Keys & Service Tokens:**
- Not backed up (rotatable, can be regenerated)
- Documented recovery process (operators re-issue keys)

**Recovery Procedure:**
```bash
# Retrieve signing keys from Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id santokit/hub/signing-keys \
  --query SecretString --output text | jq -r '.keys[]'

# Import keys to new Hub instance
stk keys import --project <project> --env <env> --key-file signing-key.pem
```

---

### 2.4 Bridge Instances (Ephemeral)

**No backups needed:**
- Bridge instances are stateless (no local storage)
- Configuration from environment variables (Kubernetes ConfigMap, AWS Secrets Manager)
- Release cache rebuilt from Hub on startup

**Recovery:** Redeploy Bridge instances from Docker image

---

### 2.5 BYO Database (User-Managed)

**Santokit NOT responsible:**
- Users responsible for backing up their own databases
- Recommended: Enable automated backups on RDS/Azure SQL

**Best Practices:**
- Hourly snapshots, 7-day retention
- Cross-region replication for high availability
- Test restores monthly

---

## 3. Restore Procedures

### 3.1 Hub Database Restore

#### Scenario: Accidental Data Deletion

**Symptoms:**
- Operator accidentally deleted project: `stk project delete --project prod`
- Audit log shows deletion timestamp

**Steps:**
1. Identify deletion time:
   ```bash
   stk audit log --action project.delete --since 24h
   # Output: Project 'prod' deleted at 2026-02-10 14:30:00 UTC
   ```

2. Stop Hub instances (prevent writes during restore):
   ```bash
   kubectl scale deployment hub --replicas=0
   ```

3. Restore to point-in-time (5 minutes before deletion):
   ```bash
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier hub-prod \
     --target-db-instance-identifier hub-prod-restored \
     --restore-time 2026-02-10T14:25:00Z
   ```

4. Update Hub connection string:
   ```bash
   kubectl set env deployment/hub DATABASE_URL=postgresql://hub-prod-restored:5432/hub
   ```

5. Start Hub instances:
   ```bash
   kubectl scale deployment hub --replicas=2
   ```

6. Verify restoration:
   ```bash
   stk projects list | grep prod
   # Expected: Project 'prod' present
   ```

7. Cleanup old DB (after verification):
   ```bash
   aws rds delete-db-instance --db-instance-identifier hub-prod --skip-final-snapshot
   aws rds modify-db-instance --db-instance-identifier hub-prod-restored --new-db-instance-identifier hub-prod
   ```

**Duration:** ~30 minutes (depends on DB size)

---

#### Scenario: Database Corruption

**Symptoms:**
- Hub returns 500 errors for all requests
- PostgreSQL logs show: `invalid page header` or `could not read block`

**Steps:**
1. Identify corruption extent:
   ```sql
   SELECT * FROM pg_stat_database WHERE datname = 'hub';
   -- Check for anomalies: negative stats, NULL values
   ```

2. Attempt online repair (if minor):
   ```sql
   REINDEX DATABASE hub;
   VACUUM FULL;
   ```

3. If corruption severe, restore from snapshot:
   ```bash
   # Latest clean snapshot (automated)
   aws rds describe-db-snapshots \
     --db-instance-identifier hub-prod \
     --query 'DBSnapshots[?Status==`available`]|[0].DBSnapshotIdentifier'

   # Restore
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier hub-prod-new \
     --db-snapshot-identifier <snapshot-id>
   ```

4. Follow steps 4-7 from previous scenario

**Duration:** ~1 hour (depends on snapshot size)

---

### 3.2 Audit Log Recovery

#### Scenario: Audit Log Purged Accidentally

**Symptoms:**
- Audit log query returns no results for recent dates
- Compliance audit failing

**Steps:**
1. Identify missing date range:
   ```sql
   SELECT MIN(timestamp), MAX(timestamp) FROM audit_log;
   # Gap detected: 2026-02-05 to 2026-02-08
   ```

2. Restore from S3 archive:
   ```bash
   # Download archived logs
   aws s3 sync s3://santokit-audit-archive/2026/02/05/ /tmp/audit-restore/
   aws s3 sync s3://santokit-audit-archive/2026/02/06/ /tmp/audit-restore/
   aws s3 sync s3://santokit-audit-archive/2026/02/07/ /tmp/audit-restore/
   aws s3 sync s3://santokit-audit-archive/2026/02/08/ /tmp/audit-restore/

   # Decompress and import
   for file in /tmp/audit-restore/*.csv.gz; do
     gunzip -c $file | psql $HUB_DB_URL -c "COPY audit_log FROM STDIN WITH CSV HEADER"
   done
   ```

3. Verify restoration:
   ```sql
   SELECT COUNT(*) FROM audit_log WHERE timestamp BETWEEN '2026-02-05' AND '2026-02-08';
   # Expected: Non-zero count
   ```

**Duration:** ~15 minutes (depends on log volume)

---

### 3.3 Secrets Recovery

#### Scenario: Signing Key Lost

**Symptoms:**
- Bridge instances failing to verify JWT tokens
- All End User requests return 401 UNAUTHORIZED

**Steps:**
1. Retrieve backup from Secrets Manager:
   ```bash
   aws secretsmanager get-secret-value \
     --secret-id santokit/hub/signing-keys \
     --version-stage AWSPREVIOUS \
     --query SecretString --output text > signing-key-backup.json
   ```

2. Import to Hub:
   ```bash
   stk keys import --project <project> --env <env> --key-file signing-key-backup.json
   ```

3. Force Bridge to sync keys:
   ```bash
   stk bridge force-sync --env <env>
   ```

4. Verify:
   ```bash
   # Test token generation and verification
   TOKEN=$(stk auth create-token --user-id test_user --env <env>)
   curl -H "Authorization: Bearer $TOKEN" /db/users/select
   # Expected: 200 OK
   ```

**Duration:** ~5 minutes

---

## 4. Failover Procedures

### 4.1 Hub Multi-AZ Failover (Automated)

**Trigger:**
- Primary Hub instance unhealthy (ELB health check fails)
- AWS AZ failure

**AWS Auto-Failover:**
1. ELB detects primary Hub unhealthy (3 failed health checks)
2. Traffic routed to secondary Hub instance (standby AZ)
3. RDS Multi-AZ automatically fails over (30-60 seconds)

**Manual Failover (if auto-failover fails):**
```bash
# Force RDS failover
aws rds reboot-db-instance \
  --db-instance-identifier hub-prod \
  --force-failover

# Restart Hub instances
kubectl rollout restart deployment hub
```

**Duration:** ~2 minutes (automated)

---

### 4.2 Multi-Region Failover (Manual)

**Trigger:**
- Entire AWS region down (rare)
- Prolonged outage (> 1 hour)

**Prerequisites:**
- Hub DB replicated to secondary region (cross-region read replica)
- DNS managed by Route 53 (or similar)

**Steps:**
1. Promote read replica to master:
   ```bash
   aws rds promote-read-replica \
     --db-instance-identifier hub-prod-replica-us-west \
     --region us-west-2
   ```

2. Update DNS (Route 53 failover routing):
   ```bash
   aws route53 change-resource-record-sets \
     --hosted-zone-id Z123456 \
     --change-batch '{
       "Changes": [{
         "Action": "UPSERT",
         "ResourceRecordSet": {
           "Name": "hub.santokit.com",
           "Type": "CNAME",
           "TTL": 60,
           "ResourceRecords": [{"Value": "hub-us-west.rds.amazonaws.com"}]
         }
       }]
     }'
   ```

3. Deploy Hub instances to secondary region:
   ```bash
   kubectl apply -f k8s/hub-deployment.yaml --context=us-west-2
   ```

4. Update Bridge instances to point to new Hub URL:
   ```bash
   kubectl set env deployment/bridge \
     STK_HUB_URL=https://hub-us-west.santokit.com
   ```

5. Verify:
   ```bash
   stk hub status --region us-west-2
   # Expected: Hub healthy
   ```

**Duration:** ~30 minutes (manual process)

---

### 4.3 Bridge Instance Failure (Auto-Healing)

**Trigger:**
- Bridge instance crash (OOM, panic)
- Kubernetes liveness probe fails

**Kubernetes Auto-Healing:**
1. Liveness probe detects unhealthy Bridge (3 consecutive failures)
2. Kubernetes restarts container
3. New container starts, fetches release from Hub
4. Ready probe passes, traffic resumes

**No manual intervention needed**

**Duration:** ~30 seconds (automated)

---

## 5. Testing & Drills

### 5.1 Disaster Recovery Drills

**Quarterly DR Drill:**
- Simulate Hub DB failure
- Restore from snapshot
- Verify all services functional
- Document lessons learned

**Monthly Backup Verification:**
- Restore Hub DB to test environment
- Run smoke tests
- Verify audit log integrity

**Annual Multi-Region Failover Test:**
- Promote replica to master
- Test DNS failover
- Rollback after test

### 5.2 Runbook Maintenance

**Update runbooks:**
- After each DR drill (capture lessons learned)
- After major architecture changes (new components, dependencies)
- When tools/scripts change (CLI commands, AWS APIs)

---

## 6. Communication Plan

### 6.1 Incident Declaration

**When to declare disaster:**
- Hub unavailable > 1 hour (exceeds RTO)
- Data loss detected
- Multi-region outage

**Incident Commander:**
- On-call engineer (primary)
- Escalate to CTO if > 2 hours

### 6.2 Stakeholder Notification

**Internal:**
- Engineering team: Slack #incidents
- Management: Email + Slack DM

**External (customers):**
- Status page: https://status.santokit.com
- Email: status@santokit.com
- Updates every 30 minutes during incident

**Template:**
```
🚨 INCIDENT: Hub Unavailable
Status: Investigating
Start time: 2026-02-10 14:00 UTC
Impact: Operators unable to apply schema changes
ETA: Unknown (investigating)

We are actively working to resolve this issue.
Next update: 14:30 UTC
```

---

## 7. Post-Incident Review

### 7.1 Incident Report Template

**Required within 48 hours of resolution:**

```markdown
# Incident Report: [Title]

## Summary
- **Incident ID:** INC-2026-001
- **Start Time:** 2026-02-10 14:00 UTC
- **End Time:** 2026-02-10 16:30 UTC
- **Duration:** 2.5 hours
- **Severity:** P1 (Major)
- **Impact:** Operators unable to apply schema changes

## Timeline
- 14:00 — Hub DB primary instance failed (EBS volume issue)
- 14:05 — Automated failover triggered (RDS Multi-AZ)
- 14:07 — Failover completed, Hub operational
- 14:10 — Bridge instances failed to connect (stale DNS cache)
- 14:30 — Manual Bridge restart initiated
- 15:00 — All Bridge instances healthy
- 16:30 — Incident closed

## Root Cause
AWS EBS volume degradation (AWS-side issue)

## Resolution
AWS replaced EBS volume, RDS Multi-AZ failover successful

## Action Items
- [ ] Enable enhanced monitoring for EBS metrics (Owner: SRE, Due: 2026-02-15)
- [ ] Reduce DNS TTL for Hub endpoint (60s → 10s) (Owner: DevOps, Due: 2026-02-12)
- [ ] Add alert for Bridge → Hub connection failures (Owner: Eng, Due: 2026-02-17)

## Lessons Learned
- Multi-AZ failover worked as expected
- DNS caching delayed full recovery (30 min impact)
- Need better visibility into AWS-side infrastructure issues
```

---

## 8. Related Documents

- **`plan/spec/observability.md`** — Monitoring and alerting
- **`plan/flows/incident-response.md`** — Operational incident response
- **`plan/spec/limits.md`** — Capacity planning
- **`plan/spec/schema-evolution.md`** — Safe schema migrations

---

## Summary

**DR Principles:**
1. **Automate backups** — Hourly snapshots, no manual intervention
2. **Test restores** — Weekly verification, quarterly drills
3. **Immutable audit logs** — Compliance requirement, S3 Object Lock
4. **Multi-AZ by default** — High availability, auto-failover
5. **Document everything** — Runbooks, drills, post-mortems

**Golden Rule:** Hope for the best, plan for the worst. Every minute spent on DR is an hour saved during a real disaster.
