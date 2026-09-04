package com.nexus.mdm.agent.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.nexus.mdm.agent.R
import com.nexus.mdm.agent.kiosk.AppWhitelistManager

/**
 * Adapter for Admin to select which applications are permitted in Kiosk mode.
 */
class WhitelistSelectorAdapter(
    private val apps: List<AppWhitelistManager.AppItem>,
    private val onToggle: (AppWhitelistManager.AppItem, Boolean) -> Unit
) : RecyclerView.Adapter<WhitelistSelectorAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val ivIcon: ImageView = view.findViewById(R.id.ivWhitelistIcon)
        val tvName: TextView = view.findViewById(R.id.tvWhitelistName)
        val tvPackage: TextView = view.findViewById(R.id.tvWhitelistPackage)
        val cbWhitelist: CheckBox = view.findViewById(R.id.cbWhitelist)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_whitelist_app, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = apps[position]
        holder.ivIcon.setImageDrawable(item.icon)
        holder.tvName.text = item.appName
        holder.tvPackage.text = item.packageName
        holder.cbWhitelist.isChecked = item.isWhitelisted

        holder.cbWhitelist.setOnCheckedChangeListener { _, isChecked ->
            item.isWhitelisted = isChecked
            onToggle(item, isChecked)
        }

        holder.itemView.setOnClickListener {
            holder.cbWhitelist.isChecked = !holder.cbWhitelist.isChecked
        }
    }

    override fun getItemCount(): Int = apps.size
}
