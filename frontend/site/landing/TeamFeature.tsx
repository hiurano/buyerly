import { FeatureSection, type Spec } from './FeatureSection';
import { cx } from '../ui/cx';
import feature from './Feature.module.css';
import mockup from './Mockup.module.css';

// Your team: the members list, and the invite panel laid over it.

const specs: Spec[] = [
  {
    id: 'team-roles',
    name: 'Roles',
    text: 'Workspace admins manage members, invites and settings. Buyers work with accounts, campaigns and rules. Viewers see the workspace without changing it.',
  },
  { id: 'team-teams', name: 'Teams', text: 'Split the workspace into teams, for example one per vertical or geo, and group ad accounts by team.' },
  {
    id: 'team-invite',
    name: 'Invite link',
    text: 'Share one invite link, or invite people by email with a role. Admins can reset the link or turn it off at any time.',
  },
  {
    id: 'team-workspaces',
    name: 'Workspaces',
    text: 'Belong to several workspaces and switch between them, or stay signed in to more than one account at once.',
  },
];

export function TeamFeature() {
  return (
    <FeatureSection
      id="team"
      labelId="feature-team"
      title="Your team"
      description="Invite teammates as admins, buyers or viewers, split work into teams, and switch between workspaces."
      specs={specs}
      stage={
        <div className={cx(feature.featureStage, feature.isLayered)} aria-hidden="true">
          <div className={mockup.layerArt}>
            <div className={mockup.layerList}>
              <div className={mockup.layerListPanel}>
                <div className={mockup.accHead}>
                  <span className={mockup.appViewTitle}>Members</span>
                  <span className={mockup.appTools}>
                    <span className={mockup.appPeriod}>8 members</span>
                  </span>
                </div>
                <div className={cx(mockup.mbRow, mockup.isHead)}>
                  <span>Name</span>
                  <span>Email</span>
                  <span>Role</span>
                  <span>Team</span>
                </div>
                <div className={mockup.mbRow}>
                  <span className={mockup.mbName}>
                    <i className={mockup.accAvatar}>AK</i>Anna Kovacs
                  </span>
                  <span>anna@northwind.io</span>
                  <span>Workspace admin</span>
                  <span>Lead gen</span>
                </div>
                <div className={mockup.mbRow}>
                  <span className={mockup.mbName}>
                    <i className={mockup.accAvatar}>MR</i>Max Romero
                  </span>
                  <span>max@northwind.io</span>
                  <span>Buyer</span>
                  <span>Sweepstakes</span>
                </div>
                <div className={mockup.mbRow}>
                  <span className={mockup.mbName}>
                    <i className={mockup.accAvatar}>LS</i>Lena Schulz
                  </span>
                  <span>lena@northwind.io</span>
                  <span>Buyer</span>
                  <span>E-commerce</span>
                </div>
                <div className={mockup.mbRow}>
                  <span className={mockup.mbName}>
                    <i className={mockup.accAvatar}>DT</i>Didier Thomas
                  </span>
                  <span>didier@northwind.io</span>
                  <span>Buyer</span>
                  <span>Lead gen</span>
                </div>
                <div className={mockup.mbRow}>
                  <span className={mockup.mbName}>
                    <i className={mockup.accAvatar}>JP</i>Jori Park
                  </span>
                  <span>jori@northwind.io</span>
                  <span>Viewer</span>
                  <span>—</span>
                </div>
                <div className={mockup.mbRow}>
                  <span className={mockup.mbName}>
                    <i className={mockup.accAvatar}>KB</i>Karri Berg
                  </span>
                  <span>karri@northwind.io</span>
                  <span>Buyer</span>
                  <span>Sweepstakes</span>
                </div>
                <div className={mockup.mbRow}>
                  <span className={mockup.mbName}>
                    <i className={mockup.accAvatar}>NO</i>Nik Olsen
                  </span>
                  <span>nik@northwind.io</span>
                  <span>Buyer</span>
                  <span>Lead gen</span>
                </div>
                <div className={mockup.mbRow}>
                  <span className={mockup.mbName}>
                    <i className={mockup.accAvatar}>GP</i>Gabriel Price
                  </span>
                  <span>gabriel@northwind.io</span>
                  <span>Viewer</span>
                  <span>—</span>
                </div>
              </div>
            </div>
            <div className={mockup.layerTop}>
              <div className={mockup.layerTopHead}>
                <span className={mockup.nrCrumb}>Settings</span>
                <span className={mockup.nrSep}>›</span>
                <span className={mockup.nrTitle}>Invite to your workspace</span>
              </div>
              <div className={mockup.layerTopBody}>
                <div>
                  <div className={mockup.ivLabel}>Invite link</div>
                  <div className={mockup.ivField}>
                    <span>buyerly.app/invite/8f2kq7xw</span>
                    <span className={mockup.ivCopy}>Copy</span>
                  </div>
                  <div className={mockup.ivLabel}>Email</div>
                  <div className={cx(mockup.ivField, mockup.isTall)}>
                    <span className={mockup.ivChip}>lena@northwind.io</span>
                    <span className={mockup.ivChip}>karri@northwind.io</span>
                  </div>
                  <div className={mockup.ivRow}>
                    <span className={mockup.nrPill}>Invite as Buyer ▾</span>
                    <span className={mockup.nrCreate}>Send 2 invites</span>
                  </div>
                  <div className={mockup.ivMenu}>
                    <div className={mockup.ivRole}>
                      <b>Workspace admin</b>
                      <span>Manages members, invites and workspace settings</span>
                    </div>
                    <div className={cx(mockup.ivRole, mockup.isOn)}>
                      <b>Buyer</b>
                      <span>Works with accounts, campaigns and rules</span>
                    </div>
                    <div className={mockup.ivRole}>
                      <b>Viewer</b>
                      <span>Sees the workspace without changing it</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className={mockup.ivLabel}>Teams</div>
                  <div className={mockup.tmRow}>
                    <i className={mockup.accAvatar}>LG</i>
                    <b>Lead gen</b>
                    <span>4 members · 3 ad accounts</span>
                  </div>
                  <div className={mockup.tmRow}>
                    <i className={mockup.accAvatar}>SW</i>
                    <b>Sweepstakes</b>
                    <span>2 members · 2 ad accounts</span>
                  </div>
                  <div className={mockup.tmRow}>
                    <i className={mockup.accAvatar}>EC</i>
                    <b>E-commerce</b>
                    <span>1 member · 2 ad accounts</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    />
  );
}
