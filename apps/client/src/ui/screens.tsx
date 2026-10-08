import type { ReactElement } from 'react';
import { hackGrid } from './hack-grid';
import type {
  ChatChannelModel,
  CreationPreview,
  HackModel,
  HudModel,
  InventoryModel,
  MapModel,
  MenuModel,
  Notification,
  Palette,
  ProgramModel,
  QuestModel,
  SettingsModel,
  TradeModel,
} from './models';

export function MainMenuScreen({ model }: { model: MenuModel }): ReactElement {
  return (
    <section data-screen="menu">
      <h1>{model.brandKey}</h1>
      <ul>
        {model.actions.map((action) => (
          <li key={action.id}>{action.labelKey}</li>
        ))}
      </ul>
    </section>
  );
}

export function CreationScreen({ model }: { model: CreationPreview }): ReactElement {
  if (!model.ok) {
    return <section data-screen="creation">{model.error}</section>;
  }
  return (
    <section data-screen="creation">
      <p>{model.stats.body}</p>
      <p>{model.derived.hp}</p>
    </section>
  );
}

export function HudScreen({ model }: { model: HudModel }): ReactElement {
  return (
    <section data-screen="hud">
      <p>
        {model.hp}/{model.maxHp}
      </p>
      <ul>
        {model.actions.map((action) => (
          <li key={action.id}>{action.key}</li>
        ))}
      </ul>
    </section>
  );
}

export function InventoryScreen({ model }: { model: InventoryModel }): ReactElement {
  return (
    <section data-screen="inventory">
      <ul>
        {model.tabs.map((tab) => (
          <li key={tab}>{tab}</li>
        ))}
      </ul>
      <ul>
        {model.bag.map((item) => (
          <li key={item.id} data-item={item.itemId}>
            {item.itemId}
          </li>
        ))}
        {model.slots
          .filter((slot) => slot.visible)
          .map((slot) => (
            <li key={slot.id} data-advanced={slot.advanced}>
              {slot.id}
            </li>
          ))}
      </ul>
    </section>
  );
}

export function CraftScreen({ recipes }: { recipes: readonly { id: string }[] }): ReactElement {
  return (
    <section data-screen="craft">
      <ul>
        {recipes.map((recipe) => (
          <li key={recipe.id}>{recipe.id}</li>
        ))}
      </ul>
    </section>
  );
}

export function QuestScreen({ model }: { model: QuestModel }): ReactElement {
  return (
    <section data-screen="quests">
      <ul>
        {model.quests.map((quest) => (
          <li key={quest.id}>{quest.id}</li>
        ))}
      </ul>
    </section>
  );
}

export function MapScreen({ model }: { model: MapModel }): ReactElement {
  return (
    <section data-screen="map">
      <ul>
        {model.visible.map((node) => (
          <li key={node.id}>{node.kind}</li>
        ))}
      </ul>
    </section>
  );
}

export function ChatScreen({ channels }: { channels: readonly ChatChannelModel[] }): ReactElement {
  return (
    <section data-screen="chat">
      <ul>
        {channels.map((channel) => (
          <li key={channel.id} data-stub={channel.stub}>
            {channel.input ? channel.id : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TradeScreen({ model }: { model: TradeModel }): ReactElement {
  return (
    <section data-screen="trade" data-auction={model.auction}>
      <p>{model.self.gold}</p>
      <p>{model.partner.gold}</p>
    </section>
  );
}

export function HackScreen({
  model,
  hint = 'ABCD',
}: {
  model: HackModel;
  hint?: string;
}): ReactElement {
  const rows = hackGrid(hint);
  return (
    <section data-screen="hack" data-blocked={model.blocked}>
      <p>
        {model.rows}×{model.cols}
      </p>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex}>
          {row.map((symbol, column) => (
            <span key={`${rowIndex}-${column}`} data-cell={symbol}>
              {symbol}
            </span>
          ))}
        </div>
      ))}
      <input data-password="4" maxLength={4} defaultValue="" />
      <p>{model.difficulty}</p>
    </section>
  );
}

export function NotificationScreen({
  notices,
}: {
  notices: readonly Notification[];
}): ReactElement {
  return (
    <section data-screen="notifications">
      <ul>
        {notices.map((notice) => (
          <li key={notice.id}>{notice.kind}</li>
        ))}
      </ul>
    </section>
  );
}

export function SettingsScreen({ model }: { model: SettingsModel }): ReactElement {
  if (!model.ok) {
    return <section data-screen="settings">{model.error}</section>;
  }
  return (
    <section data-screen="settings">
      <p>{model.scale}</p>
      <PaletteSwatches palette={model.palette} />
    </section>
  );
}

function PaletteSwatches({ palette }: { palette: Palette }): ReactElement {
  return (
    <ul>
      <li>{palette.enemy}</li>
      <li>{palette.ally}</li>
      <li>{palette.neutral}</li>
      <li>{palette.keeper}</li>
    </ul>
  );
}

export function ProgramScreen({ model }: { model: ProgramModel }): ReactElement {
  return (
    <section data-screen="programs">
      <ul>
        {model.echoes.map((echo) => (
          <li key={echo.id}>{echo.id}</li>
        ))}
        {model.paths.map((path) => (
          <li key={path.id}>{path.id}</li>
        ))}
      </ul>
    </section>
  );
}
