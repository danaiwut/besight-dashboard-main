/** Ambient "color flows around the perimeter" glow behind the wallet
 *  card's content — see the comment above .wallet-glow-bg in dashboard.css
 *  for why this needs real stacked elements rather than a background +
 *  box-shadow/mask on a single (pseudo-)element. */
export default function WalletGlow() {
  return (
    <div className="wallet-glow-bg" aria-hidden="true">
      <div className="wallet-glow-soft">
        <div className="wallet-glow-color" />
        <div className="wallet-glow-cover-soft" />
      </div>
      <div className="wallet-glow-sharp">
        <div className="wallet-glow-color" />
        <div className="wallet-glow-cover-sharp" />
      </div>
    </div>
  );
}
