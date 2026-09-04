package com.nexus.mdm.agent.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.nexus.mdm.agent.R
import com.nexus.mdm.agent.kiosk.AppWhitelistManager

/**
 * Minimalist Grid Adapter for Launching Authorized Apps in Kiosk Mode.
 */
class KioskAppsAdapter(
    private val apps: List<AppWhitelistManager.AppItem>,
    private val onAppClick: (AppWhitelistManager.AppItem) -> Unit
) : RecyclerView.Adapter<KioskAppsAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val ivIcon: ImageView = view.findViewById(R.id.ivAppIcon)
        val tvName: TextView = view.findViewById(R.id.tvAppName)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_kiosk_app, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = apps[position]
        holder.ivIcon.setImageDrawable(item.icon)
        holder.tvName.text = item.appName
        holder.itemView.setOnClickListener {
            onAppClick(item)
        }
    }

    override fun getItemCount(): Int = apps.size
}
