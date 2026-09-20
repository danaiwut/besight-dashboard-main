//+------------------------------------------------------------------+
//| BeSightJournalSync.mq5                                             |
//| Pushes closed trades to the BeSight trading journal automatically. |
//|                                                                    |
//| INSTALL (one minute):                                              |
//| 1. MT5 → File → Open Data Folder → MQL5 → Experts → copy this file |
//|    (compile in MetaEditor with F7, or restart MT5 to auto-compile). |
//| 2. MT5 → Tools → Options → Expert Advisors → tick                  |
//|    "Allow WebRequest for listed URL" and ADD your webhook URL:     |
//|    https://YOUR-DOMAIN/api/mt/journal/sync                        |
//|    (no trailing slash). Without this MT5 blocks the push.          |
//| 3. Drag the EA onto ANY chart. In the Inputs tab set:              |
//|      WebhookUrl       = https://YOUR-DOMAIN/api/mt/journal/sync    |
//|      InvestorPassword = the INVESTOR (read-only) password you saved |
//|                         in the BeSight journal (same field).        |
//|    Login + server are read from the logged-in account automatically.|
//| 4. Tick "Allow Algo Trading" on the chart toolbar. Done — closed   |
//|    trades sync every few minutes and right after each close. Check |
//|    the Experts log for "BeSight sync: imported N".                  |
//+------------------------------------------------------------------+
#property copyright "BeSight"
#property version   "1.00"

input string WebhookUrl       = "https://YOUR-DOMAIN/api/mt/journal/sync";
input string InvestorPassword = "";
input int    HistoryDays      = 30;
input int    SyncMinutes      = 15;

datetime g_lastSync = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   EventSetTimer(MathMax(1, SyncMinutes) * 60);
   Sync();
   return(INIT_SUCCEEDED);
  }
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
  }
//+------------------------------------------------------------------+
void OnTimer()
  {
   Sync();
  }
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
      Sync();
  }
//+------------------------------------------------------------------+
string JsonEscape(const string value)
  {
   string out = value;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   return(out);
  }
//+------------------------------------------------------------------+
//| Find the opening (IN) deal of a position by its POSITION_ID.      |
//+------------------------------------------------------------------+
ulong FindInDeal(const long positionId, const int total)
  {
   for(int i = 0; i < total; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0)
         continue;
      if(HistoryDealGetInteger(ticket, DEAL_POSITION_ID) == positionId &&
         HistoryDealGetInteger(ticket, DEAL_ENTRY) == DEAL_ENTRY_IN)
         return(ticket);
     }
   return(0);
  }
//+------------------------------------------------------------------+
void Sync()
  {
//--- debounce: at most one push per minute (timer + trade events overlap)
   if(TimeCurrent() - g_lastSync < 60)
      return;
   if(StringLen(InvestorPassword) == 0)
     {
      Print("BeSight sync: set InvestorPassword in the Inputs tab first.");
      return;
     }
   g_lastSync = TimeCurrent();

   datetime from = TimeCurrent() - (datetime)(MathMax(1, HistoryDays) * 86400);
   if(!HistorySelect(from, TimeCurrent() + 60))
     {
      Print("BeSight sync: HistorySelect failed, error ", GetLastError());
      return;
     }

   int total = HistoryDealsTotal();
   string items = "";
   int count = 0;
   for(int i = 0; i < total; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0)
         continue;
      if(HistoryDealGetInteger(ticket, DEAL_ENTRY) != DEAL_ENTRY_OUT)
         continue;

      //--- original direction comes from the IN deal of the same position
      long positionId = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      ulong inTicket  = FindInDeal(positionId, total);
      ulong ref       = (inTicket != 0 ? inTicket : ticket);
      long  refType   = HistoryDealGetInteger(ref, DEAL_TYPE);
      string side     = "";
      if(refType == DEAL_TYPE_BUY)
         side = "buy";
      else if(refType == DEAL_TYPE_SELL)
         side = "sell";
      else
         continue;

      string symbol     = HistoryDealGetString(ticket, DEAL_SYMBOL);
      double volume     = HistoryDealGetDouble(ref, DEAL_VOLUME);
      datetime openTime = (datetime)HistoryDealGetInteger(ref, DEAL_TIME);
      double openPrice  = HistoryDealGetDouble(ref, DEAL_PRICE);
      datetime closeTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      double closePrice  = HistoryDealGetDouble(ticket, DEAL_PRICE);
      double profit      = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      double commission  = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      double swap        = HistoryDealGetDouble(ticket, DEAL_SWAP);
      if(volume <= 0)
         continue;

      string obj = StringFormat(
         "{\"ticket\":\"%I64u\",\"symbol\":\"%s\",\"type\":\"%s\",\"volume\":%.2f,"
         "\"openTime\":%d,\"openPrice\":%.5f,\"closeTime\":%d,\"closePrice\":%.5f,"
         "\"profit\":%.2f,\"commission\":%.2f,\"swap\":%.2f}",
         ticket, JsonEscape(symbol), side, volume,
         openTime, openPrice, closeTime, closePrice,
         profit, commission, swap);

      if(count > 0)
         items += ",";
      items += obj;
      count++;
      if(count >= 500)
         break;
     }

   if(count == 0)
     {
      Print("BeSight sync: no closed trades in range.");
      return;
     }

   string login  = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   string server = AccountInfoString(ACCOUNT_SERVER);
   string body   = StringFormat(
      "{\"login\":\"%s\",\"server\":\"%s\",\"investorPassword\":\"%s\",\"trades\":[%s]}",
      JsonEscape(login), JsonEscape(server), JsonEscape(InvestorPassword), items);

   char post[];
   StringToCharArray(body, post, 0, WHOLE_ARRAY, CP_UTF8);
   //--- drop the terminating zero StringToCharArray appends
   if(ArraySize(post) > 0)
      ArrayResize(post, ArraySize(post) - 1);

   char result[];
   string resultHeaders = "";
   string headers = "Content-Type: application/json\r\n";
   ResetLastError();
   int res = WebRequest("POST", WebhookUrl, NULL, 10000, post, result, resultHeaders, headers);
   if(res == -1)
     {
      Print("BeSight sync: WebRequest failed, error ", GetLastError(),
            " — allow the URL in Tools → Options → Expert Advisors.");
      return;
     }
   string answer = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   Print("BeSight sync [", res, "]: ", StringSubstr(answer, 0, 200));
  }
//+------------------------------------------------------------------+
